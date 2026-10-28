/**
 * Bilateral blur
 *
 * Depth-aware blur: samples are weighted down as their linear depth diverges
 * from the center depth, so the blur doesn't bleed across depth discontinuities
 * (e.g. SSAO around silhouette edges).
 *
 * One separable pass along `axis`, reaching `radius` pixels either side over
 * nine taps, as McGuire12 2.4 has it.
 *
 * @type {string}
 * @alias module:shaders.blur
 */
export default /* wgsl */ `
// Taps run from -EXTENT to +EXTENT in steps of two, and the weights below are
// expressed in those units. The caller's pixel radius is mapped onto them here
// so the tap count stays the chunk's business.
const BILATERAL_BLUR_TAP_EXTENT: f32 = 8.0;

// McGuire12's own spatial weights: a stddev-2 Gaussian, plus a 0.3 floor on
// every tap except the centre. The profile that leaves is nearly flat, and
// deliberately so — underweighting the centre is what makes nine taps average
// like ~8.6 independent samples where a plain Gaussian over the same reach
// manages ~4.8, and variance is what the pass exists to remove. Edges are the
// range term's business, not the spatial one's.
const BILATERAL_BLUR_GAUSSIAN = array<f32, 5>(0.153170, 0.144893, 0.122649, 0.092902, 0.062970);
const BILATERAL_BLUR_BASE: f32 = 0.3;

fn bilateralBlur(
  tex: texture_2d<f32>,
  texSampler: sampler,
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  axis: vec2f,
  radius: f32,
  resolution: vec2f,
  inverseProjectionMatrix: mat4x4f,
  sharpness: f32
) -> vec4f {
  var color = vec4f(0.0);
  var weightSum = 0.0;

  let centerDepth = readDepth(depthTex, depthSampler, uv, inverseProjectionMatrix);
  // The outermost tap lands on \`radius\`, so the caller's reach is in pixels and
  // the spacing follows from it.
  let stride = radius / BILATERAL_BLUR_TAP_EXTENT;

  for (var i = -8; i <= 8; i += 2) {
    let sampleUV = uv + (axis * (f32(i) * stride)) / resolution;

    let gaussian = BILATERAL_BLUR_GAUSSIAN[abs(i) / 2];
    let spatial = select(BILATERAL_BLUR_BASE + gaussian, gaussian, i == 0);

    // Range term: weight falls off with the linear depth difference, so the
    // blur stops at a silhouette instead of dragging occlusion over it.
    let sampleDepth = readDepth(depthTex, depthSampler, sampleUV, inverseProjectionMatrix);
    let diff = (sampleDepth - centerDepth) * sharpness;
    let weight = spatial * exp2(-diff * diff);

    weightSum += weight;
    color += textureSampleLevel(tex, texSampler, sampleUV, 0.0) * weight;
  }

  return color / weightSum;
}
`;
