/**
 * Motion blur reconstruction filter
 *
 * Tile-based scatter-as-gather: the velocity buffer is reduced to a coarse grid
 * of dominant motions, each tile takes the largest motion that could reach it
 * from its neighbours, and every pixel then gathers colour along that motion
 * weighting each sample by whether it plausibly smeared over the pixel.
 *
 * Paper: Guertin, McGuire & Nowrouzezahrai, "A Fast and Stable Feature-Aware
 * Motion Blur Filter", High Performance Graphics 2014 — Appendix A.
 * https://casual-effects.com/research/Guertin2014MotionBlur/
 *
 * It builds on the tile framework of McGuire, Hennessy, Bukowski & Osman, "A
 * Reconstruction Filter for Plausible Motion Blur" (I3D 2012), and differs from
 * it in the four places that matter: samples alternate between the tile's
 * dominant motion and the pixel's own so a tile whose neighbours disagree does
 * not smear in a direction nothing there is moving; the centre sample is
 * weighted and normalised by the sample count rather than special-cased, which
 * is what stops thin features ghosting; the depth comparison is relative rather
 * than scaled by a scene-dependent constant; and diagonal tiles are only
 * considered when their motion actually points inwards.
 *
 * Requires `math.saturate` and `depthRead`.
 *
 * Updates: Damien Seguin (2026-08)
 *
 * @member {string}
 */
export default /* wgsl */ `
struct MotionBlurParams {
  viewportSize: vec2f,
  texelSize: vec2f,
  // Tile size in pixels, and so also the longest motion the filter can see:
  // the neighbourhood pass reaches exactly one tile out, and motion longer than
  // that arrives from a tile nobody looked at.
  tileSize: f32,
  // Fraction of the frame the shutter is open, applied to the frame's motion.
  intensity: f32,
  // Bias on the centre sample's weight, the paper's gamma. Higher keeps more of
  // the unblurred pixel.
  centerWeightBias: f32,
  // How quickly sampling swings from across the motion to along it as a pixel's
  // own motion grows, the paper's zeta.
  directionBlend: f32,
  // Baseline jitter in pixels, the paper's xi, divided by the sample count so
  // noise falls as sampling rises without banding taking its place.
  jitterScale: f32,
  // How far from a tile border the neighbouring tile's motion starts being
  // borrowed, the paper's rho. Trades banding at tile edges for noise.
  tileBlend: f32,
  near: f32,
  far: f32,
}

override MOTION_BLUR_SAMPLES: i32 = 35;

// Relative depth comparison: 1 while a is no further than b, falling to 0 as it
// recedes past it. Relative rather than scaled by a fixed interval so that two
// objects at 10 and 20 units blend like two at 1000 and 2000 — the filter then
// holds up at any scene scale, which a hard-coded interval cannot.
fn motionBlurZCompare(za: f32, zb: f32) -> f32 {
  return saturateF32(1.0 - (za - zb) / min(za, zb));
}

// Falls off over the extent one sample's own motion could have covered.
fn motionBlurCone(T: f32, extent: f32) -> f32 {
  return saturateF32(1.0 - abs(T) / extent);
}

// Flat across the motion and falling away at its ends: two samples that are
// both blurred contribute to each other over the whole overlap, not in
// proportion to their distance.
fn motionBlurCylinder(T: f32, extent: f32) -> f32 {
  return 1.0 - smoothstep(0.95 * extent, 1.05 * extent, abs(T));
}

// Half a pixel is the floor everywhere in this filter: below it a motion is not
// a direction, and normalising by it would amplify numerical noise into one.
fn motionBlurDirection(v: vec2f) -> vec2f {
  return v / max(length(v), 0.5);
}

// Frame motion in pixels, scaled by the shutter and clipped to what the tile
// grid can represent.
fn motionBlurVelocity(
  velocityTexture: texture_2d<f32>,
  velocitySampler: sampler,
  uv: vec2f,
  params: MotionBlurParams
) -> vec2f {
  let v = textureSampleLevel(velocityTexture, velocitySampler, uv, 0.0).xy *
    params.viewportSize * params.intensity;
  let magnitude = length(v);

  // Scaled rather than clamped per component, so a motion past the limit keeps
  // its direction instead of snapping to a diagonal.
  if (magnitude > params.tileSize) { return v * (params.tileSize / magnitude); }
  return v;
}

// Largest motion among the eight neighbouring tiles and this one, with the
// diagonals held to a stricter test: a corner tile can only smear across this
// one if its motion actually points inwards, where an edge tile needs only a
// slight deviation. Taking corners unconditionally overestimates the motion
// reaching this tile and blurs where nothing moved.
fn motionBlurNeighborMax(
  tileTexture: texture_2d<f32>,
  tileSampler: sampler,
  tileUV: vec2f,
  tileTexelSize: vec2f
) -> vec2f {
  var result = vec2f(0.0);
  var best = 0.0;

  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      let offset = vec2f(f32(x), f32(y));
      let v = textureSampleLevel(
        tileTexture, tileSampler, tileUV + offset * tileTexelSize, 0.0
      ).xy;

      // Points from that tile towards this one.
      let inwards = dot(v, -offset);
      if (x != 0 && y != 0 && inwards <= 0.0) { continue; }

      let magnitude = length(v);
      if (magnitude > best) {
        best = magnitude;
        result = v;
      }
    }
  }

  return result;
}

// Which tile a pixel reads its dominant motion from, stochastically reaching
// into the neighbouring one as it approaches a border.
//
// Interpolating between two tiles' motions is not an option — averaging two
// directions describes a motion neither object has, and antiparallel ones
// cancel — so the choice is made per pixel instead, turning a visible seam into
// noise the eye reads as grain. One axis only: a diagonal tile does not border
// this one along the edge being crossed.
fn motionBlurTileOffset(uv: vec2f, jitter: f32, params: MotionBlurParams) -> vec2f {
  let fromCenter = fract(uv * params.viewportSize / params.tileSize) - 0.5;
  let axis = select(
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), abs(fromCenter.x) > abs(fromCenter.y)
  );
  // 0 at the tile centre, 1 at its border.
  let closeness = dot(abs(fromCenter), axis) * 2.0;

  if (closeness * params.tileBlend > abs(jitter)) {
    return axis * sign(dot(fromCenter, axis));
  }
  return vec2f(0.0);
}

// Van der Corput radical inverse in base 2, indexed by pixel — the
// low-discrepancy jitter the paper asks for, without a noise texture to carry
// it. Returns [-1, 1].
fn motionBlurJitter(pixel: vec2u) -> f32 {
  var bits = pixel.x * 1973u + pixel.y * 9277u;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);

  return f32(bits) * 2.3283064365386963e-10 * 2.0 - 1.0;
}

fn motionBlurReconstruct(
  uv: vec2f,
  pixel: vec2u,
  colorTexture: texture_2d<f32>,
  colorSampler: sampler,
  velocityTexture: texture_2d<f32>,
  velocitySampler: sampler,
  neighborMaxTexture: texture_2d<f32>,
  neighborMaxSampler: sampler,
  depthTexture: texture_depth_2d,
  depthSampler: sampler,
  params: MotionBlurParams
) -> vec3f {
  let center = textureSampleLevel(colorTexture, colorSampler, uv, 0.0).rgb;
  let jitter = motionBlurJitter(pixel);

  let tileUV = uv + motionBlurTileOffset(uv, jitter, params) *
    params.tileSize * params.texelSize;
  let vmax = textureSampleLevel(neighborMaxTexture, neighborMaxSampler, tileUV, 0.0).xy;
  let lengthVmax = length(vmax);

  // Nothing that could reach this pixel moved far enough to smear across it.
  if (lengthVmax <= 0.5) { return center; }

  let vc = motionBlurVelocity(velocityTexture, velocitySampler, uv, params);
  let lengthVc = max(length(vc), 0.5);
  let zc = readDepth(depthTexture, depthSampler, uv, params.near, params.far);

  // Across the dominant motion while this pixel is still, swinging round to
  // along its own motion as that grows. Sampling across the motion is what
  // gathers colour from the object that is about to smear over this pixel;
  // sampling along it is what smears this pixel's own colour.
  let wn = motionBlurDirection(vmax);
  var wp = vec2f(-wn.y, wn.x);
  if (dot(wp, vc) < 0.0) { wp = -wp; }
  let wc = normalize(
    mix(wp, vc / lengthVc, saturateF32((lengthVc - 0.5) / params.directionBlend))
  );

  // The centre is the first sample rather than a term added afterwards, and its
  // weight is divided by the sample count so the result stops changing as that
  // count does — which is what keeps thin features from thinning out as
  // sampling rises.
  let sampleCount = f32(MOTION_BLUR_SAMPLES);
  var totalWeight = sampleCount / (params.centerWeightBias * lengthVc);
  var result = center * totalWeight;

  let offset = jitter * params.jitterScale / sampleCount;

  for (var i: i32 = 0; i < MOTION_BLUR_SAMPLES; i++) {
    let t = mix(-1.0, 1.0, (f32(i) + offset + 1.0) / (sampleCount + 1.0));

    // Alternating, so half the samples follow what is moving through this
    // neighbourhood and half follow what this pixel is doing. A tile whose
    // dominant motion belongs to something else then no longer drags the
    // whole tile with it.
    let d = select(vmax, vc, (i & 1) == 1);
    let direction = motionBlurDirection(d);
    let T = t * lengthVmax;
    let sampleUV = uv + d * t * params.texelSize;

    let vs = motionBlurVelocity(velocityTexture, velocitySampler, sampleUV, params);
    let lengthVs = max(length(vs), 0.5);
    let zs = readDepth(depthTexture, depthSampler, sampleUV, params.near, params.far);

    // How much each of the two surfaces is in front of the other. Both, rather
    // than one classification, because a partly-occluding blur contributes as
    // both cases at once.
    let foreground = motionBlurZCompare(zs, zc);
    let background = motionBlurZCompare(zc, zs);

    // How well each motion agrees with the direction being sampled along, so a
    // sample taken across a surface's motion counts for less than one taken
    // along it.
    let alignSample = abs(dot(motionBlurDirection(vs), direction));
    let alignCenter = abs(dot(wc, direction));

    // The three ways a sample can belong here: something blurred moving over
    // this pixel, this pixel's own blur reaching out to it, and both blurred
    // and overlapping.
    var weight = foreground * motionBlurCone(T, lengthVs) * alignSample;
    weight += background * motionBlurCone(T, lengthVc) * alignCenter;
    weight += motionBlurCylinder(T, min(lengthVs, lengthVc)) *
      max(alignSample, alignCenter) * 2.0;

    totalWeight += weight;
    result += textureSampleLevel(colorTexture, colorSampler, sampleUV, 0.0).rgb * weight;
  }

  return max(vec3f(0.0), result / totalWeight);
}
`;
