/**
 * SAO (Scalable Ambient Obscurance)
 *
 * Paper:
 * https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf
 * (https://casual-effects.com/research/McGuire2012SAO/index.html)
 *
 * Reference Implementation: G3D's AmbientOcclusion_AO.pix / _minify.pix.
 *
 * Requires a depth pyramid built with rotated grid subsampling
 * (`DEPTH_PYRAMID_ROTATED_GRID`): the taps reconstruct through its inverse.
 *
 * Updates: Marcin Ignac (2017-05-08) and Damien Seguin (2023-10, 2026-09)
 *
 * @type {string}
 * @alias module:shaders.sao
 */
export default /* wgsl */ `
struct SAOParams {
  // The four terms that invert the projection:
  // (2 / (w * P00), -2 / (h * P11), (P20 - 1) / P00, (1 + P21) / P11).
  projInfo: vec4f,
  far: f32,
  // Height in pixels of a 1m object one metre from the camera: 0.5 * h * P11.
  projScale: f32,
  intensity: f32, // darkening factor
  radius: f32, // world-space AO radius in scene units (r), e.g. 1.0m
  bias: f32, // bias to avoid AO in smooth corners, e.g. 0.01m
  brightness: f32,
  contrast: f32,
}

// SAO_NUM_SAMPLES and SAO_NUM_SPIRAL_TURNS are expected to be declared as
// \`override\` i32 by the composing pipeline shader. SAO_NUM_SPIRAL_TURNS
// should be a prime number to prevent taps from lining up.
override SAO_NUM_SAMPLES: i32 = 11;
override SAO_NUM_SPIRAL_TURNS: i32 = 7;

// The reference's value. It only bites when a tap lands very close, where
// vn/(eps + vv) would run away; the 2x2 reconstruction below is what makes it
// safe, so the two move together.
const SAO_EPSILON: f32 = 0.001;

// Screen-space radius, in pixels, below which there is no way to compute AO.
const SAO_MIN_RADIUS: f32 = 3.0;
// log2 of the largest tap offset kept at a given level. Under 3 too many taps
// land in the same texel and the variance reads as flicker; over 5 the working
// set no longer fits in cache. The paper found every value in between
// equivalent.
const SAO_LOG_MAX_OFFSET: i32 = 3;
// One below the paper's five, matching what the prefilter can produce: a
// storage texture view is a single mip and WebGPU only guarantees four storage
// texture bindings per stage.
const SAO_MAX_MIP_LEVEL: i32 = 3;

// Returns a unit vector and a screen-space radius for the tap on a unit disk
// (the caller should scale by the actual disk radius)
fn saoTapLocation(sampleNumber: i32, spinAngle: f32, numSpiralTurnsTimesTwoPi: f32, radiusScreenOut: ptr<function, f32>) -> vec2f {
  // Radius relative to radiusScreen
  let alpha = (f32(sampleNumber) + 0.5) / f32(SAO_NUM_SAMPLES);
  let angle = alpha * numSpiralTurnsTimesTwoPi + spinAngle;

  *radiusScreenOut = alpha;
  return vec2f(cos(angle), sin(angle));
}

// Camera-space position from a pixel coordinate and a positive view-space
// distance, after the reference's reconstructCSPosition. Carrying the
// projection as projInfo rather than a field of view is what makes it hold for
// an asymmetric frustum: an offset or jittered projection is a different
// matrix, not a different fov. Pixel coordinates, so a tap needs no conversion
// to and from [0, 1].
fn saoReconstructPosition(pixelCoord: vec2f, viewDepth: f32, params: SAOParams) -> vec3f {
  return vec3f((pixelCoord * params.projInfo.xy + params.projInfo.zw) * viewDepth, -viewDepth);
}

// The occluding point in view space, read from the pyramid level that keeps a
// tap this far out in cache. The tap picks the level and the texel; the point
// is then reconstructed at the texel the depth came from, not at the tap
// itself, so it is a position that was actually in the scene. The reference
// reconstructs at the tap and absorbs the resulting off-surface displacement
// into a larger bias, because its mip filter has no inverse to undo it with.
fn saoOffsetPosition(depthTex: texture_2d<u32>, pixCoord: vec2i, unitOffset: vec2f, radiusScreen: f32, params: SAOParams) -> vec3f {
  let mipLevel = clamp(i32(floor(log2(radiusScreen))) - SAO_LOG_MAX_OFFSET, 0, SAO_MAX_MIP_LEVEL);

  // Clamped here rather than inside the load, so the texel the depth is read
  // from is the one the position is reconstructed at, edges included.
  let mipSize = vec2i(textureDimensions(depthTex, u32(mipLevel)));
  let tapCoord = vec2i(radiusScreen * unitOffset) + pixCoord;
  let mipCoord = clamp(tapCoord >> vec2u(u32(mipLevel)), vec2i(0), mipSize - vec2i(1));
  let sampleDepth = depthPyramidLoad(depthTex, mipCoord, mipLevel);

  let srcCoord = depthPyramidRotatedGridSource(mipCoord, mipLevel);
  return saoReconstructPosition(vec2f(srcCoord) + 0.5, sampleDepth, params);
}

fn saoSample(
  depthTex: texture_2d<u32>,
  pixCoord: vec2i,
  positionView: vec3f,
  normalView: vec3f,
  sampleRadiusScreen: f32,
  tapIndex: i32,
  rotationAngle: f32,
  radius2: f32,
  numSpiralTurnsTimesTwoPi: f32,
  params: SAOParams
) -> f32 {
  // Offset on the unit disk, spun for this pixel
  var radiusScreen = 0.0;
  let unitOffset = saoTapLocation(tapIndex, rotationAngle, numSpiralTurnsTimesTwoPi, &radiusScreen);
  // Keep the tap off its own texel: without this the innermost taps of the
  // spiral all read the centre pixel, which the pyramid then amplifies.
  radiusScreen = max(0.75, radiusScreen * sampleRadiusScreen);

  let samplePositionView = saoOffsetPosition(depthTex, pixCoord, unitOffset, radiusScreen, params);

  let v = samplePositionView - positionView;

  let vv = dot(v, v);
  let vn = dot(v, normalView) - params.bias;

  let f = max(radius2 - vv, 0.0) / radius2;
  return f * f * f * max(vn / (SAO_EPSILON + vv), 0.0);
}

// McGuire12 2.3's closing step: average the estimate over the 2x2 quad the
// rasterizer already shades in lockstep. It costs two derivative pairs and no
// additional tap, and it is why the blur that follows can space its taps three
// pixels apart. It is also what keeps SAO_EPSILON at the reference's value: the
// near taps epsilon guards throw single-pixel outliers, which is exactly what a
// quad average removes.
//
// The derivatives chain rather than both applying to the estimate: after the x
// pass every lane holds its row's mean, so differentiating *that* in y averages
// the two rows and leaves every lane with the quad's mean.
//
// Bilateral, as the paper has it: a quad straddling a silhouette holds two
// surfaces, and averaging them drags occlusion across the edge. The test is the
// depth gradient over the quad, relative to depth so that a receding surface is
// not mistaken for a discontinuity — at 10% per quad it withholds the average
// from real depth jumps only, an inclined surface never reaching it.
const SAO_QUAD_EDGE_THRESHOLD: f32 = 0.1;

fn saoReconstructQuad(visibility: f32, depth: f32, fragCoord: vec2f) -> f32 {
  let parity = vec2f(vec2i(fragCoord) & vec2i(1));

  let rowMean = visibility + (0.5 - parity.x) * dpdxFine(visibility);
  let quadMean = rowMean + (0.5 - parity.y) * dpdyFine(rowMean);

  let depthGradient = abs(dpdxFine(depth)) + abs(dpdyFine(depth));
  return select(visibility, quadMean, depthGradient < depth * SAO_QUAD_EDGE_THRESHOLD);
}

fn sao(
  depthTex: texture_2d<u32>,
  normalTex: texture_2d<f32>,
  fragCoord: vec2f,
  params: SAOParams
) -> f32 {
  var visibility = 1.0;

  let numSamplesFloat = f32(SAO_NUM_SAMPLES);
  let numSpiralTurnsTimesTwoPi = f32(SAO_NUM_SPIRAL_TURNS) * TWO_PI;

  let pixCoord = vec2i(fragCoord);
  let originDepth = depthPyramidLoad(depthTex, pixCoord, 0);
  let originView = saoReconstructPosition(fragCoord, originDepth, params);

  // The disk spans \`radius\` metres whatever the resolution. Negated because
  // view space is -Z forward.
  let radiusScreen = -params.projScale * params.radius / originView.z;

  // The prefilter clamps the background to exactly the far plane, so nothing
  // there has a surface to occlude; below SAO_MIN_RADIUS the disk is too small
  // to hold a tap that resolves anything.
  if (originDepth < params.far && radiusScreen > SAO_MIN_RADIUS) {
    let normalView = normalize(textureLoad(normalTex, pixCoord, 0).rgb * 2.0 - 1.0);

    // Interleaved gradient noise [Jimenez14], used directly as the turn
    // fraction. Low discrepancy over a small neighbourhood is what the blur
    // needs — it spreads a 3x3's rotations 2.3x more evenly than white noise —
    // and unlike a tiled texture it has no period and costs no fetch.
    //
    // Directly: a product of two independent draws has density -ln(z), which
    // would leave half the pixels spun under a fifth of a turn.
    let noise = fract(52.9829189 * fract(dot(fragCoord, vec2f(0.06711056, 0.00583715))));
    let randomPatternRotationAngle = noise * TWO_PI;

    let radius2 = params.radius * params.radius;

    var sum = 0.0;
    for (var i = 0; i < SAO_NUM_SAMPLES; i++) {
      sum += saoSample(depthTex, pixCoord, originView, normalView, radiusScreen, i, randomPatternRotationAngle, radius2, numSpiralTurnsTimesTwoPi, params);
    }

    // The reference's combine. \`intensity\` scales the sum rather than acting as
    // an exponent on a value already close to 1, which is what gives it a
    // usable range now that the falloff tapers. Our f already carries the
    // 1/r^6 the reference applies separately as intensityDivR6.
    var occlusion = max(0.0, 1.0 - sum * params.intensity * 5.0 / numSamplesFloat);
    // Anti-tone map: lifts the midtones and drags the dark region further down,
    // so contact shadows read without the whole term going flat.
    occlusion = (pow(occlusion, 0.2) + 1.2 * occlusion * occlusion * occlusion * occlusion) / 2.2;
    // Fade in over the pixel or so where the disk first becomes usable, rather
    // than letting AO pop on at the threshold.
    visibility = mix(1.0, occlusion, saturateF32(radiusScreen - SAO_MIN_RADIUS));
  }

  // Outside the branch: derivatives are only defined in uniform control flow,
  // and every lane of the quad has to reach them. Before the grading, so what
  // is averaged is the estimate rather than the user's curve over it.
  visibility = saoReconstructQuad(visibility, originDepth, fragCoord);

  return saturateF32(brightnessContrastF32(visibility, params.brightness, params.contrast));
}
`;
