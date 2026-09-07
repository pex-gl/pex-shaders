/**
 * Depth of Field
 *
 * Tile-based scatter-as-gather at half resolution, near and far fields
 * separated: prefilter colour and circle of confusion together, reduce the
 * circle of confusion to a coarse grid, gather both fields from one set of
 * taps, composite back at full resolution.
 *
 * The arrangement production depth of field converged on — Jimenez, "Next
 * Generation Post Processing in Call of Duty: Advanced Warfare" (SIGGRAPH
 * 2014), Unity's HDRP, AMD's FidelityFX Depth of Field. The reasons are
 * structural rather than about cost:
 *
 * - **Scatter as gather.** Testing per tap whether *that tap's* disc reaches
 *   here means an in-focus pixel has no disc and cannot leak onto a defocused
 *   neighbour, and normalising by the weights that did reach reconstructs the
 *   background behind a foreground object. A tap's weight is the inverse of its
 *   own disc area, which is the half of scattering a gather otherwise loses:
 *   what a source delivers per destination is what makes a near field cover its
 *   own disc rather than everything the tile can see.
 * - **Near and far are different problems.** The far field composites by the
 *   destination's own defocus, the near field by its own coverage. One image
 *   cannot carry both.
 * - **Tiles bound the near search.** A foreground scatters in from wherever it
 *   is, so only the neighbourhood knows how far to look. The far field's limit
 *   is the destination's own defocus instead.
 * - **The highlight boost belongs in the prefilter.** Per tap it is computed
 *   per destination, so one bright source is boosted differently by every pixel
 *   gathering it and the disc redraws itself as the image moves.
 *
 * Circles of confusion are signed and in half-resolution pixels of radius
 * throughout: positive in front of the focal plane, negative behind it.
 * Distances are millimetres, the unit the thin lens model works in.
 *
 * Split into the passes rather than shipped whole, since most of them share
 * only the parameter block: the tile reduction and the mip chain touch neither
 * depth nor a circle of confusion, and the post filter needs no more than a
 * luminance. Each member names what it requires.
 *
 * Sources
 *
 * - Jorge Jimenez, "Next Generation Post Processing in Call of Duty: Advanced
 *   Warfare", SIGGRAPH 2014.
 *   https://advances.realtimerendering.com/s2014/index.html
 *   Scatter as gather at half resolution, the near and far fields as separate
 *   images, and the coarse grid that bounds the near search.
 * - AMD FidelityFX Depth of Field, `ffx_dof_blur.h`,
 *   `ffx_dof_downsample_color.h`, `ffx_dof_composite.h`.
 *   https://github.com/GPUOpen-LibrariesAndSDKs/FidelityFX-SDK/tree/v1.1.2/sdk/include/FidelityFX/gpu/dof
 *   The arrangement here, closest of the three: one gather feeding both fields,
 *   a bilateral mip chain that takes a fixed texel of each block rather than
 *   averaging or dilating its radius (`FfxDofDownsampleQuad`), the
 *   inverse-disc-area sample weight (`FfxDofWeight`) and the coverage it
 *   normalises (`fgOpacity`), the outside-in ring buckets the occlusion merge
 *   follows (`FfxDofMergeBuckets`), per-tile radii, and the cubic the near
 *   field is composited through (`FfxCubicSpline`).
 * - Unity HDRP, `DepthOfFieldGather.compute`, `DepthOfFieldMip.compute`,
 *   `DoFGatherUtils.hlsl`.
 *   https://github.com/Unity-Technologies/Graphics/tree/master/Packages/com.unity.render-pipelines.high-definition/Runtime/PostProcessing/Shaders
 *   The far field's search bounded by the destination's own defocus
 *   (`limit = min(maxFarCoC, 2 * abs(centerCoC))` — the factor of two
 *   deliberately not carried over, see below), the near field's coverage read
 *   as a radius rather than an area fraction (`sqrt(fraction * PI)`) and ramped
 *   by `smoothstep`, and a chain the near gather does not read at all
 *   (`mip = 0.0`) because a coarse level cannot describe a silhouette.
 * - Unity post-processing stack v2, `Builtins/DepthOfField.shader`.
 *   https://github.com/Unity-Technologies/PostProcessing
 *   `bgCoC = max(min(samp0.a, samp.a), 0)` against `fgWeight`: the far field
 *   tests the destination's own defocus, the near field the tap's own.
 *
 * @type {object}
 * @name depthOfField
 * @static
 */

/**
 * The parameter block. Every other member builds on it, and it is all the
 * gather needs — that pass works from a prefiltered circle of confusion and
 * never touches depth.
 *
 * @member {string}
 */
const common = /* wgsl */ `
struct DepthOfFieldParams {
  // Full-resolution viewport and grid.
  viewportSize: vec2f,
  texelSize: vec2f,
  // The grid every pass but the composite rasterizes into.
  halfTexelSize: vec2f,
  // Where autofocus reads, in UV.
  screenPoint: vec2f,
  near: f32,
  far: f32,
  // mm. Overridden by the autofocus pass when there is one.
  focusDistance: f32,

  // Physical model: a thin lens, from the camera's own optics.
  focalLength: f32, // mm
  fStop: f32,
  // Circle of confusion diameter on the sensor, in mm, to half-resolution
  // pixels of radius: viewportHeight * 0.25 / sensorHeight.
  cocScale: f32,
  // Plain multiplier on the result, for a shot that wants more than the lens
  // gives.
  focusScale: f32,

  // Artistic model: how blurry, how deep, how sharply it ramps.
  // Circle of confusion radius reached at infinity, in half-resolution pixels.
  blurScale: f32,
  // Depth of the in-focus zone around focusDistance, in mm.
  focusRange: f32,
  // Ramp exponent outside that zone. 1 is linear, above holds focus longer then
  // blurs faster, below leaves the zone immediately.
  focusFalloff: f32,

  // Cap, in half-resolution pixels.
  maxCoCRadius: f32,
  // Per-channel displacement of the bokeh, as a fraction of its radius.
  chromaticAberration: f32,
  luminanceThreshold: f32,
  luminanceGain: f32,
  luminanceKnee: f32,
  // Diaphragm blades. Under three there is no polygon and the aperture is round.
  blades: f32,
  bladeRotation: f32,
  bladeCurvature: f32,
}

`;

/**
 * Linear depth, in the millimetres the thin lens model works in. Requires
 * {@link common} and `depthRead`.
 *
 * @member {string}
 */
const depth = /* wgsl */ `
fn dofDepth(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  params: DepthOfFieldParams
) -> f32 {
  // m -> mm
  return readDepth(depthTex, depthSampler, uv, params.near, params.far) * 1000.0;
}
`;

/**
 * Circle of confusion from depth, under either model. Requires {@link common},
 * and {@link depth} for the callers that read it off the depth buffer.
 *
 * @member {string}
 */
const coc = /* wgsl */ `
override USE_DOF_PHYSICAL: bool = true;

// Thin lens: A * f * |z - zf| / (z * (zf - f)), with the aperture diameter
// A = f / N. Signed rather than absolute — which field a pixel belongs to is
// the whole of the separation below.
fn dofCoCPhysical(depth: f32, focusDistance: f32, params: DepthOfFieldParams) -> f32 {
  let f = params.focalLength;
  // Nothing inside the focal length has an image, and the focus distance sits
  // in a denominator.
  let z = max(depth, f + 1e-3);
  let zf = max(focusDistance, f + 1e-3);

  let diameter = (f * f) / (params.fStop * (zf - f)) * (zf - z) / z;

  return diameter * params.cocScale * params.focusScale;
}

// Blur amount, in-focus depth and ramp, for a scene with no camera to speak of.
//
// Laid over the same hyperbola the thin lens traces rather than over depth, so
// an artistic curve still inherits a real lens' asymmetry: the in-focus zone
// reaches further behind the subject than in front of it, and the background
// blur saturates while the foreground's does not.
fn dofCoCArtistic(depth: f32, focusDistance: f32, params: DepthOfFieldParams) -> f32 {
  let zf = max(focusDistance, 1e-3);
  let z = max(depth, 1e-3);

  // -1 at infinity, 0 at the focal plane, unbounded towards the camera.
  let t = (zf - z) / z;
  // Half-width of the in-focus zone in those same units.
  let h = min(params.focusRange * 0.5 / zf, 0.999);

  let ramp = pow(max(abs(t) - h, 0.0) / (1.0 - h), params.focusFalloff);

  return sign(t) * params.blurScale * ramp;
}

// One clamp over both models, so switching between them changes the curve and
// never the scale.
fn dofCoC(depth: f32, focusDistance: f32, params: DepthOfFieldParams) -> f32 {
  let coc = select(
    dofCoCArtistic(depth, focusDistance, params),
    dofCoCPhysical(depth, focusDistance, params),
    USE_DOF_PHYSICAL
  );

  return clamp(coc, -params.maxCoCRadius, params.maxCoCRadius);
}
`;

/**
 * Autofocus: the distance the frame focuses at, read off a screen point.
 * Requires {@link common} and {@link depth}.
 *
 * @member {string}
 */
const focus = /* wgsl */ `
fn dofMedian5(taps: array<f32, 5>) -> f32 {
  var v = taps;

  for (var i = 0; i < 4; i++) {
    for (var j = 0; j < 4 - i; j++) {
      let lo = min(v[j], v[j + 1]);
      let hi = max(v[j], v[j + 1]);
      v[j] = lo;
      v[j + 1] = hi;
    }
  }

  return v[2];
}

// Autofocus over a small cross rather than one texel. A thin object crossing
// the reticle otherwise racks the whole image's focus onto it, and it is the
// median that rejects it — the minimum is exactly the thin object.
fn dofFocusDistance(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  params: DepthOfFieldParams
) -> f32 {
  let o = params.texelSize * 3.0;
  let p = params.screenPoint;

  return dofMedian5(array<f32, 5>(
    dofDepth(depthTex, depthSampler, p, params),
    dofDepth(depthTex, depthSampler, p + vec2f(-o.x, -o.y), params),
    dofDepth(depthTex, depthSampler, p + vec2f(o.x, -o.y), params),
    dofDepth(depthTex, depthSampler, p + vec2f(-o.x, o.y), params),
    dofDepth(depthTex, depthSampler, p + vec2f(o.x, o.y), params)
  ));
}
`;

/**
 * Temporal resolve of the circle of confusion, which a jittered raster needs
 * before anything prefilters it. Requires {@link common}, {@link depth} and
 * {@link coc}.
 *
 * @member {string}
 */
const resolve = /* wgsl */ `
// The range of circles of confusion the pixel's immediate neighbourhood covers.
//
// Both models are monotonically decreasing in depth, so the neighbourhood's
// extremes are the extremes of its depth: nine depth taps, two evaluations.
fn dofCoCRange(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  focusDistance: f32,
  params: DepthOfFieldParams
) -> vec2f {
  var nearest = 3.4e38;
  var furthest = 0.0;

  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let offset = vec2f(f32(x), f32(y)) * params.texelSize;
      let depth = dofDepth(depthTex, depthSampler, uv + offset, params);
      nearest = min(nearest, depth);
      furthest = max(furthest, depth);
    }
  }

  return vec2f(
    dofCoC(furthest, focusDistance, params),
    dofCoC(nearest, focusDistance, params)
  );
}

// One frame of the circle of confusion accumulated into the jitter sequence.
//
// A depth texel at a silhouette holds a different surface every frame, and
// nothing can shift it back: the buffer holds one point sample per texel, and a
// sub-texel offset is a no-op against a point sampler. Every consumer here is a
// hard function of it — the prefilter's bilateral weight, the reference it keys
// on, the tile maximum — so sub-pixel depth becomes a discrete change of
// colour, of gather radius and of mip level.
//
// Accumulating converges on the coverage-weighted mean instead, which is the
// right answer for an edge pixel that is a mixture of two surfaces.
//
// Clamping to the neighbourhood bounds the lag as well as the ghosting: racking
// focus moves the local range, and the history is forced into it that frame.
fn dofResolveCoC(
  current: f32,
  range: vec2f,
  history: f32,
  historyValid: f32,
  blendFactor: f32
) -> f32 {
  let clamped = clamp(history, range.x, range.y);

  // Nothing to continue: take this frame whole rather than blending towards it
  // from a texture that holds another view.
  return mix(clamped, current, max(blendFactor, 1.0 - historyValid));
}
`;

/**
 * The prefilter's mip chain, and the bilateral weight it shares with the
 * prefilter itself. Needs neither depth nor the parameters — a level is a
 * filter over colour and a circle of confusion that are already computed.
 * Requires `math.saturate`.
 *
 * @member {string}
 */
const downsample = /* wgsl */ `
// How much a texel belongs with the one that will represent its block.
//
// Relative rather than absolute: the texels compared are one half-resolution
// pixel apart at level 0 and 2^N apart at level N, so a fixed tolerance that
// holds a smooth gradient together at the top of the chain rejects it at the
// bottom and leaves the filter point-sampling a reference texel.
fn dofBilateralWeight(coc: f32, reference: f32) -> f32 {
  return saturateF32(1.0 - abs(coc - reference) / max(abs(reference), 1.0));
}

// One level of the prefilter's chain, bilateral on the same rule.
//
// A box filter would average the circle of confusion along with the colour, so
// a coarse texel straddling a silhouette reports a radius between the two
// surfaces' and the gather spreads the sharp one as though it had the blurry
// one's disc. One texel of the block stands for it instead, and the colour is
// averaged only over the texels agreeing with that one.
//
// A fixed texel, not the largest radius in the block. Taking the largest looks
// like it protects the far field — a sharp foreground against a defocused
// background drops out of the coarse levels — but it is a dilation, and in the
// near field it runs the wrong way: a defocused foreground is promoted over a
// whole 2^N block that is mostly background, so the gather reads a foreground
// where there is none and the near field reaches its own radius plus the block.
// Nothing needs the largest, because a tap standing for the wrong surface
// rejects itself: its radius is small, so it spreads nowhere.
//
// The stored radius is in half-resolution pixels at every level. It says how
// far that content reaches on screen, not how big the texel recording it got.
fn dofDownsample(tex: texture_2d<f32>, texSampler: sampler, texCoord: vec2f) -> vec4f {
  let texelSize = 1.0 / vec2f(textureDimensions(tex));

  var offsets = array<vec2f, 4>(
    vec2f(-0.5, -0.5),
    vec2f(0.5, -0.5),
    vec2f(-0.5, 0.5),
    vec2f(0.5, 0.5)
  );

  var taps = array<vec4f, 4>();

  for (var i = 0; i < 4; i++) {
    taps[i] = textureSampleLevel(tex, texSampler, texCoord + offsets[i] * texelSize, 0.0);
  }

  let reference = taps[0].a;

  var color = vec3f(0.0);
  var weight = 0.0;

  for (var i = 0; i < 4; i++) {
    let w = dofBilateralWeight(taps[i].a, reference);
    color += taps[i].rgb * w;
    weight += w;
  }

  // The reference weighs 1, so this can never divide by zero.
  return vec4f(color / weight, reference);
}
`;

/**
 * Half-resolution colour and circle of confusion in one texture. Requires
 * {@link common}, {@link depth}, {@link coc}, {@link downsample},
 * `math.saturate`, `luma` and `threshold`.
 *
 * @member {string}
 */
const prefilter = /* wgsl */ `
// The four full-resolution texels that fall under one half-resolution texel.
fn dofQuadOffset(i: i32) -> vec2f {
  return vec2f(f32(i % 2) * 2.0 - 1.0, f32(i / 2) * 2.0 - 1.0) * 0.5;
}

// Straight from depth, for a frame whose raster carries no sub-pixel offset.
fn dofCoCQuadFromDepth(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  texCoord: vec2f,
  focusDistance: f32,
  params: DepthOfFieldParams
) -> array<f32, 4> {
  var cocs = array<f32, 4>();

  for (var i = 0; i < 4; i++) {
    let uv = texCoord + dofQuadOffset(i) * params.texelSize;
    cocs[i] = dofCoC(dofDepth(depthTex, depthSampler, uv, params), focusDistance, params);
  }

  return cocs;
}

// From the resolved texture. Point sampled: already at full resolution, and
// interpolating would round the silhouettes it just resolved.
fn dofCoCQuadFromTexture(
  cocTex: texture_2d<f32>,
  cocSampler: sampler,
  texCoord: vec2f,
  params: DepthOfFieldParams
) -> array<f32, 4> {
  var cocs = array<f32, 4>();

  for (var i = 0; i < 4; i++) {
    let uv = texCoord + dofQuadOffset(i) * params.texelSize;
    cocs[i] = textureSampleLevel(cocTex, cocSampler, uv, 0.0).r;
  }

  return cocs;
}

// Half-resolution colour and circle of confusion in one texture: rgb is what
// the gather spreads, a the signed radius deciding how far.
//
// Bilateral, keyed on the circle of confusion rather than on depth: averaging
// a sharp foreground into a defocused background is what makes a silhouette
// leak. One texel of the quad stands for the block and the colour is averaged
// over those agreeing with it — the rule the chain above runs on, and a fixed
// texel for the same reason.
fn dofPrefilter(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  quad: array<f32, 4>,
  params: DepthOfFieldParams
) -> vec4f {
  // Dynamic indexing needs a var; a parameter binds like a let.
  var cocs = quad;

  var colors = array<vec3f, 4>();

  for (var i = 0; i < 4; i++) {
    let uv = texCoord + dofQuadOffset(i) * params.texelSize;
    colors[i] = textureSampleLevel(tex, texSampler, uv, 0.0).rgb;
  }

  let reference = cocs[0];

  var color = vec3f(0.0);
  var weight = 0.0;

  for (var i = 0; i < 4; i++) {
    let w = dofBilateralWeight(cocs[i], reference);
    color += colors[i] * w;
    weight += w;
  }

  // The reference weighs 1, so this can never divide by zero.
  color /= weight;

  // An artistic punch-up, off by default, and not an energy correction: a
  // normalised gather of unclamped radiance already spreads a highlight over
  // its disc correctly. The boost older depth of field carries exists to undo a
  // clamped pipeline, and nothing here clamps.
  //
  // Thresholded on exposed luma, the units bloom thresholds in, so neither
  // effect silently retargets when exposure changes. Soft-kneed because a
  // circle of confusion is never perfectly steady, and a hard cutoff makes a
  // highlight sitting at the threshold blink rather than fade in.
  let excess = thresholdSoft(
    luma(color),
    params.luminanceThreshold,
    params.luminanceKnee
  );
  // Saturating, so the multiplier approaches 1 + gain. Unbounded it overflows
  // the half-float target the gather normalises through, and one inf in the
  // numerator takes the whole disc to NaN.
  let boost = params.luminanceGain * excess / (1.0 + excess);

  // Ramped over the same half pixel the composite hands the far field over on,
  // so a highlight brightens as it spreads.
  return vec4f(color * (1.0 + boost * saturateF32(abs(reference) - 0.5)), reference);
}
`;

/**
 * The coarse grid that bounds the near field's search, and its dilation.
 * Standalone, like {@link downsample}.
 *
 * @member {string}
 */
const tiles = /* wgsl */ `
override DOF_TILE_SIZE: i32 = 8;

override DOF_TILE_DILATE_RADIUS: i32 = 4;

// The two fields spread in opposite directions, so a tile carries the extent of
// each as a positive magnitude: x near, y far.
fn dofTileCoC(coc: f32) -> vec2f {
  return vec2f(max(coc, 0.0), max(-coc, 0.0));
}
`;

/**
 * Both fields from one set of taps, which is what makes this one pass. Requires
 * {@link common}, `math.PI`, `math.TWO_PI` and `math.saturate`.
 *
 * @member {string}
 */
const gather = /* wgsl */ `
// A cap on the rings, not the ring count. One ring per pixel of radius is what
// resolves a disc exactly, so the count is derived from the radius and this
// only says how much the gather may spend when that is more than affordable —
// FidelityFX's MaxRings against its idealRingCount, and its quality setting.
override DOF_RINGS: i32 = 3;

override DOF_SAMPLES: i32 = 6;

override USE_DOF_RING_OCCLUSION: bool = true;

// Levels the prefilter actually has, past which there is nothing to read.
override DOF_MAX_MIP: f32 = 4.0;

struct DoFFields {
  far: vec4f,
  near: vec4f,
}

const DOF_GOLDEN_ANGLE: f32 = 2.39996323;

// Screen-static, and deliberately so: depth of field runs after the temporal
// resolve, so a per-frame rotation has nothing left to average it out and would
// only be noise that moves.
fn dofDither(fragCoord: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(fragCoord, vec2f(0.06711056, 0.00583715))));
}

// Radius of a diaphragm with straight blades, normalized so the blade corners
// sit on the unit circle: apothem over the cosine of the angle from a blade's
// normal.
fn dofBladeRadius(angle: f32, params: DepthOfFieldParams) -> f32 {
  if (params.blades < 3.0) {
    return 1.0;
  }

  let sector = TWO_PI / params.blades;
  let a = angle + params.bladeRotation;
  let offset = a - sector * floor(a / sector) - sector * 0.5;

  return mix(cos(sector * 0.5) / cos(offset), 1.0, params.bladeCurvature);
}

// How much of a source pixel's disc lands on a destination that far away, with
// a pixel of feather so a disc grows in rather than switching on.
fn dofSpread(cocRadius: f32, distance: f32) -> f32 {
  return saturateF32(cocRadius - distance + 1.0);
}

// How much of a source's disc arrives at any one destination inside it.
//
// A defocused pixel spreads its radiance over pi*r^2, so what reaches a given
// destination falls as the inverse of that area. Uniform weights instead let a
// strongly defocused foreground deliver as much per pixel as a barely defocused
// one, which spreads a near field over the width of the tile rather than of its
// own disc.
//
// Saturating below about half a pixel of radius, where the disc is contained in
// its own texel and scatters onto nothing.
fn dofScatter(cocRadius: f32) -> f32 {
  return saturateF32(1.0 / max(PI * cocRadius * cocRadius, 1e-4));
}

// Both fields from one set of taps: the taps are what this costs, and each
// field's test is a comparison in pixels that does not care which radius the
// loop ran to.
//
// Samples sit on evenly spaced concentric rings, ring i carrying i *
// DOF_SAMPLES of them at i / rings of the radius, where the ring count itself
// comes from the radius. A sample count rising with the circumference makes the
// density uniform per unit area, so the plain sum is a disc integral and the
// near field's coverage an area fraction. It is also what lets one mip level
// serve every ring.
//
// Rings run outwards in and the far field merges them one at a time, because
// that ordering approximates a depth ordering: a sample far enough out to still
// reach the centre must have a large circle of confusion, and in the far field
// a larger one means further away.
fn dofGather(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  fragCoord: vec2f,
  tile: vec2f,
  params: DepthOfFieldParams
) -> DoFFields {
  let center = textureSampleLevel(tex, texSampler, texCoord, 0.0);

  // How far anything behind this pixel may bleed over it: this pixel's own
  // defocus, not the source's. A surface is an occluder — the background disc
  // overlapping it in image space is blocked by it, and what is left is the
  // softness of the occluder's own edge. Without it a sky at the radius cap
  // reaches the full tile radius onto a barely defocused floor.
  //
  // The far field only. A foreground does scatter over what is behind it, so
  // the near field tests the tap's own radius and carries visibility in its
  // coverage — the asymmetry Unity's post-processing stack draws between its
  // bgCoC and fgWeight.
  let centerFar = max(-center.a, 0.0);

  var fields: DoFFields;
  fields.far = vec4f(center.rgb, 1.0);
  fields.near = vec4f(0.0);

  // What the rings span. The tile's near extent, since a foreground scatters in
  // from wherever it is; but for the far field this pixel's own defocus,
  // because nothing beyond it passes the test above and rings placed out there
  // sample a guaranteed-empty annulus.
  //
  // Spanning the tile's far extent instead puts the tile grid in the image: the
  // rings, and the level derived from them below, step wherever the dilated
  // maximum steps while the blur they describe does not, so a surface at one
  // depth reads as blocks. HDRP writes the same expression with a factor of two
  // on the centre; above one the minimum can select the tile again, which
  // brings the blocks back.
  let radius = max(tile.x, min(tile.y, centerFar));
  if (radius < 0.5) {
    return fields;
  }

  // One ring per pixel of radius, capped. Spending a fixed count over whatever
  // radius the tile asks for makes the ring spacing grow with the blur, and the
  // near field is what that costs: it spans the tile's near extent while the
  // rings span the larger of the two fields' needs, so a foreground sharper
  // than the background behind it gets one or two rings across its whole disc
  // and its coverage falls off in plateaus one ring apart — a stepped outline
  // that follows the tile grid rather than the silhouette. Deriving the count
  // bounds that spacing at a pixel until the cap binds, and below the cap it
  // also stops the gather spending four rings on a three pixel disc.
  let rings = min(max(i32(ceil(radius)), 1), DOF_RINGS);
  let ringCount = f32(rings);

  // Colour premultiplied by weight in rgb, weight in a.
  var far = vec4f(0.0);
  // Weighted mean circle of confusion of what is accumulated, which is what the
  // occlusion test compares a ring against.
  var farRadius = 0.0;

  var nearColor = vec3f(0.0);
  var nearWeight = 0.0;
  var nearCount = 0.0;

  let phase = dofDither(fragCoord) * TWO_PI;

  // One level for the whole kernel, not one per ring. Evenly spaced rings
  // carrying samples in proportion to their circumference put every tap the
  // same radial gap and the same arc from its neighbours, so a single footprint
  // describes all of them. Per-ring levels give a bright point to the inner
  // rings sharp and to the outer ones blurred, counting its energy several
  // times over and leaving a hot core.
  let footprint = max(
    radius / ringCount,
    TWO_PI * radius / (ringCount * f32(DOF_SAMPLES))
  );
  let lod = clamp(log2(max(footprint, 1.0)), 0.0, DOF_MAX_MIP);

  for (var ring = rings; ring >= 0; ring--) {
    // Ring 0 has zero radius and one sample, so it is the centre tap, and it
    // merges last because it is the nearest thing there is.
    let count = max(ring * DOF_SAMPLES, 1);
    let angleStep = TWO_PI / f32(count);

    // Evenly spaced, which makes the tap density uniform per unit area and so
    // the plain sum a disc integral: ring i stands for an annulus whose area
    // grows as i and carries i * DOF_SAMPLES samples to cover it, and the
    // centre's single tap for the small disc inside the first midpoint.
    let t = f32(ring) / ringCount;
    let ringRadius = radius * t;

    // Rings whose sample counts share a divisor put their samples on the same
    // spokes, and the disc then reads as a star.
    let ringPhase = phase + f32(ring) * DOF_GOLDEN_ANGLE;

    var bucket = vec4f(0.0);
    var bucketRadius = 0.0;
    // The weight this ring would carry if every tap reached, which is what
    // turns the accumulated weight into the fraction of the pixel it covers.
    var bucketArea = 0.0;

    for (var i = 0; i < count; i++) {
      let angle = ringPhase + f32(i) * angleStep;
      // The aperture's shape decides where the sample sits and how much area it
      // stands for: placing samples on the polygon scales the area element by
      // the square of its radius in that direction. One for a round aperture,
      // which is the default.
      let shape = dofBladeRadius(angle, params);
      let distance = ringRadius * shape;
      let offset = vec2f(cos(angle), sin(angle)) * distance;
      let weight = shape * shape;

      // Ring 0 included: a tap standing for less area than its neighbours is
      // not a sharper centre, it is the unblurred image added to the blurred
      // one at 1/count. Invisible on ordinary content and overwhelming on the
      // highlights bokeh exists for — the emitter punches through its own disc.
      let tap = textureSampleLevel(
        tex,
        texSampler,
        texCoord + offset * params.halfTexelSize,
        lod
      );

      // A tap's own disc is the aperture's shape too, and the direction that
      // decides whether it reaches this pixel is the one from the tap back to
      // here. Shaping only the placement would leave the acceptance test
      // circular, so the bokeh's shape would depend on what else sits nearby.
      let reach = dofBladeRadius(angle + PI, params);

      let tapFar = min(max(-tap.a, 0.0), centerFar);
      let w = dofSpread(tapFar * reach, distance) * weight;
      bucket += vec4f(tap.rgb * w, w);
      bucketRadius += tapFar * w;
      bucketArea += weight;

      // Weighted by how defocused the tap is as well as by whether it reaches
      // here: an in-focus pixel is not part of the near field at all, and its
      // disc covering its own texel must not read as coverage. Load-bearing now
      // that the scatter weight saturates below half a pixel — without it the
      // sharpest taps in the kernel would be the ones carrying the most weight.
      let tapNear = max(tap.a, 0.0);
      let near = dofSpread(tapNear * reach, distance)
        * saturateF32(tapNear)
        * dofScatter(tapNear)
        * weight;
      nearColor += tap.rgb * near;
      nearWeight += near;
      // The area this kernel spends on the near field, which the coverage
      // below turns into a fraction. Aperture weights only — the scatter
      // weight belongs to the tap, and the tile's stands in for it there — and
      // only the taps inside the tile's own disc.
      nearCount += weight * step(distance, tile.x + 1.0);
    }

    bucketRadius /= max(bucket.a, 1e-4);

    // Off, this is zero and the merge is the plain weighted sum. On, a ring
    // hides what is behind it only where it is both covering the pixel and
    // nearer than what is accumulated, so a flat background is untouched.
    //
    // Relative, not a difference in pixels: a background receding smoothly
    // across the gather is several pixels of radius wide from edge to centre
    // without being two surfaces, and an absolute test at that width lets the
    // innermost ring erase the whole background.
    var occlusion = 0.0;
    if (USE_DOF_RING_OCCLUSION) {
      occlusion = saturateF32((farRadius - bucketRadius) / max(farRadius, 1.0))
        * (bucket.a / max(bucketArea, 1e-4));
    }

    let survives = 1.0 - occlusion;
    let merged = far.a * survives + bucket.a;
    farRadius = (farRadius * far.a * survives + bucketRadius * bucket.a) / max(merged, 1e-4);
    far = far * survives + bucket;
  }

  // The far field carries no coverage: what decides whether a pixel takes it is
  // that pixel's own defocus, not this one's.
  fields.far = vec4f(far.rgb / max(far.a, 1e-4), 1.0);

  // The near field is foreground over an unknown background, so it is an image
  // with coverage — premultiplied, so the post filter's blur and the
  // composite's bilinear read stay correct where that coverage is partial.
  //
  // Normalised against what this kernel would carry if every tap were a
  // foreground at the tile's own radius, which is what makes the fraction a
  // coverage rather than the local disc's area over the tile's. Those differ by
  // (coc / tile)^2, and the tile is a dilated neighbourhood maximum: a floor
  // receding towards the camera would then read as barely covered anywhere its
  // own defocus fell short of the nearest thing in the frame, in steps
  // following the tile grid. The inverse-area weights cancel that ratio, so the
  // answer stops depending on what else the tile happens to hold.
  //
  // Ramped rather than taken as it is. A gather's coverage falls away across
  // the whole disc, and laying that over the image linearly washes foreground
  // colour over everything within reach; HDRP and FidelityFX put the same cubic
  // on it, in the gather and at the composite respectively. Here, so that what
  // the post filter blurs and the composite reads is already premultiplied by
  // the coverage that will be used.
  let coverage = smoothstep(
    0.0,
    1.0,
    saturateF32(nearWeight / max(dofScatter(tile.x) * nearCount, 1e-4))
  );
  fields.near = vec4f(nearColor / max(nearWeight, 1e-4) * coverage, coverage);

  return fields;
}
`;

/**
 * The near field's post filter: a median that rejects the speckle a dithered
 * gather leaves along a silhouette. Requires `luma`.
 *
 * @member {string}
 */
const postFilter = /* wgsl */ `
// Below this a texel carries no foreground worth speaking of, and its colour
// cannot be recovered from a premultiplied one.
const DOF_MIN_COVERAGE: f32 = 0.01;

fn dofMedian3(a: f32, b: f32, c: f32) -> f32 {
  return max(min(a, b), min(max(a, b), c));
}

// Median of nine, as medians of medians: the largest of the three minima, the
// median of the three medians, the smallest of the three maxima, and the median
// of those. Exact, and branch-free — verified against a true median on random
// neighbourhoods. FidelityFX writes it as FfxMed9.
fn dofMedian9(v: array<f32, 9>) -> f32 {
  let lo = max(
    max(min(min(v[0], v[1]), v[2]), min(min(v[3], v[4]), v[5])),
    min(min(v[6], v[7]), v[8])
  );
  let mid = dofMedian3(
    dofMedian3(v[0], v[1], v[2]),
    dofMedian3(v[3], v[4], v[5]),
    dofMedian3(v[6], v[7], v[8])
  );
  let hi = min(
    min(max(max(v[0], v[1]), v[2]), max(max(v[3], v[4]), v[5])),
    max(max(v[6], v[7]), v[8])
  );

  return dofMedian3(lo, mid, hi);
}

// One near-field texel, despeckled.
//
// The gather's ring phase is per pixel and screen-static — depth of field runs
// after the temporal resolve, so a phase that moved per frame would be noise
// nothing averages away — and where few taps land on a foreground, which two of
// them land decides the coverage. That reads as a fixed stipple along every
// silhouette, and averaging spreads a bright speck into a soft blob instead of
// removing it.
//
// So the colour is not averaged. The centre texel is kept and rescaled towards
// the luminance its neighbourhood agrees on: a lone speck is divided down by
// however far it stands out, a texel already in agreement is multiplied by one
// and keeps its detail. Bounded at two, so the filter can lift a lone dark
// texel without inventing a highlight. FidelityFX's FfxDofFilterNF.
//
// Luminance is compared on unpremultiplied colour. The stipple is in the
// coverage as much as in the colour, so premultiplied luma would measure how
// covered a texel is rather than how bright, and the rescale would drag the
// partly covered edge of a silhouette towards the interior's luminance —
// raising colour without raising coverage, which reads as a bright fringe.
//
// A neighbourhood that is mostly empty has a zero median, and then the rescale
// is skipped rather than collapsing the one covered texel in it.
fn dofFilterNear(tex: texture_2d<f32>, texSampler: sampler, texCoord: vec2f, texelSize: vec2f) -> vec4f {
  var lumas = array<f32, 9>();
  var premultiplied = vec3f(0.0);
  var coverage = 0.0;
  var center = vec4f(0.0);

  for (var i = 0; i < 9; i++) {
    let offset = vec2f(f32(i % 3) - 1.0, f32(i / 3) - 1.0) * texelSize;
    let tap = textureSampleLevel(tex, texSampler, texCoord + offset, 0.0);

    lumas[i] = luma(tap.rgb / max(tap.a, DOF_MIN_COVERAGE));
    premultiplied += tap.rgb;
    coverage += tap.a;

    if (i == 4) {
      center = tap;
    }
  }

  // Coverage is averaged over the nine, which is where the spatial smoothing
  // went, and is what a premultiplied image expects.
  //
  // That average can be non-zero over a centre texel that holds none, and a
  // premultiplied texel with no coverage has no colour either — keeping it
  // would paint a dark seam one texel wide around the whole near field. The
  // neighbourhood's coverage-weighted mean is the colour that seam should
  // carry, which is the sum of the premultiplied taps over the coverage that
  // premultiplied them. FidelityFX borrows the brightest corner instead; this
  // needs no such choice, because a premultiplied sum already weights every
  // neighbour by how much foreground it holds.
  let covered = center.a > DOF_MIN_COVERAGE;
  let color = select(
    premultiplied / max(coverage, DOF_MIN_COVERAGE),
    center.rgb / center.a,
    covered
  );

  let median = dofMedian9(lumas);
  let gain = select(
    1.0,
    clamp(median / lumas[4], 0.0, 2.0),
    covered && median > 0.0 && lumas[4] > 0.0
  );

  coverage /= 9.0;

  return vec4f(color * gain * coverage, coverage);
}
`;

/**
 * The two fields over the sharp image, at full resolution, and the debug view.
 * Requires {@link common} and `math.saturate`.
 *
 * @member {string}
 */
const composite = /* wgsl */ `
override USE_DOF_CHROMATIC_ABERRATION: bool = false;

override USE_DOF_TRANSITION_BLUR: bool = true;

// Four bilinear taps half a radius out: the same disc, at the resolution that
// can still see it.
fn dofTransitionBlur(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  radius: f32,
  params: DepthOfFieldParams
) -> vec3f {
  let o = params.texelSize * radius * 0.5;

  return 0.25 * (
    textureSampleLevel(tex, texSampler, texCoord + vec2f(-o.x, -o.y), 0.0).rgb
    + textureSampleLevel(tex, texSampler, texCoord + vec2f(o.x, -o.y), 0.0).rgb
    + textureSampleLevel(tex, texSampler, texCoord + vec2f(-o.x, o.y), 0.0).rgb
    + textureSampleLevel(tex, texSampler, texCoord + vec2f(o.x, o.y), 0.0).rgb
  );
}

// One field, with the lens' colour fringing. Displacing each channel before the
// gather and after it are the same convolution — a blur is shift invariant — so
// this costs three taps per field rather than three per tap.
//
// Only the fringing that scales with the circle of confusion belongs here. The
// lateral kind scales with distance from the optical centre instead, and
// belongs with distortion and vignetting, after the tone map.
fn dofSampleField(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  fringe: vec2f
) -> vec4f {
  if (!USE_DOF_CHROMATIC_ABERRATION) {
    return textureSampleLevel(tex, texSampler, texCoord, 0.0);
  }

  let r = textureSampleLevel(tex, texSampler, texCoord + vec2f(0.0, 1.0) * fringe, 0.0);
  let g = textureSampleLevel(tex, texSampler, texCoord + vec2f(-0.866, -0.5) * fringe, 0.0);
  let b = textureSampleLevel(tex, texSampler, texCoord + vec2f(0.866, -0.5) * fringe, 0.0);

  return vec4f(r.r, g.g, b.b, (r.a + g.a + b.a) / 3.0);
}

// The sharp image, its own small blur, the far field, then the near field over
// all three.
//
// The transition blur exists because between about one and three pixels of
// radius the half-resolution gather is too coarse to describe the blur, and
// switching straight to it pops as content crosses that width.
fn dofComposite(
  tex: texture_2d<f32>,
  texSampler: sampler,
  farTex: texture_2d<f32>,
  farSampler: sampler,
  nearTex: texture_2d<f32>,
  nearSampler: sampler,
  texCoord: vec2f,
  coc: f32,
  params: DepthOfFieldParams
) -> vec4f {
  let color = textureSampleLevel(tex, texSampler, texCoord, 0.0);

  // Full-resolution pixels: the gather is measured in its own grid, and what
  // follows chooses between that grid and this one.
  let radius = abs(coc) * 2.0;
  let fringe = params.halfTexelSize * params.chromaticAberration * abs(coc);

  var result = color.rgb;
  if (USE_DOF_TRANSITION_BLUR) {
    result = dofTransitionBlur(tex, texSampler, texCoord, min(radius, 3.0), params);
  }

  // Only a pixel that is itself behind the focal plane takes the far field: a
  // sharp object in front of a defocused background stays sharp to its edge.
  let far = dofSampleField(farTex, farSampler, texCoord, fringe);
  result = mix(result, far.rgb, saturateF32(max(-coc, 0.0) - 0.5));

  // Premultiplied, so this is "over" and not a mix.
  let near = dofSampleField(nearTex, nearSampler, texCoord, fringe);
  result = result * (1.0 - near.a) + near.rgb;

  // The chain carries alpha through for a canvas configured with a transparent
  // background, and nothing here has an opinion about coverage.
  return vec4f(result, color.a);
}

// Near field red, far field blue, saturating at the radius cap, with the focal
// plane where both go black. Green is the tile's dilated radius: what the
// gather spent its samples on, which the composited image cannot show.
fn dofDebug(coc: f32, tile: vec2f, params: DepthOfFieldParams) -> vec3f {
  let scale = 1.0 / max(params.maxCoCRadius, 1e-4);

  return vec3f(
    max(coc, 0.0) * scale,
    max(tile.x, tile.y) * scale * 0.25,
    max(-coc, 0.0) * scale
  );
}
`;

export {
  common,
  depth,
  coc,
  focus,
  resolve,
  downsample,
  prefilter,
  tiles,
  gather,
  postFilter,
  composite,
};
