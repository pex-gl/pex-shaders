/**
 * Bilateral blur
 *
 * Depth-aware blur: samples are weighted down as their linear depth diverges
 * from the center depth, so the blur doesn't bleed across depth
 * discontinuities (e.g. SSAO around silhouette edges).
 *
 * @type {string}
 * @alias module:chunks.blur
 */
export default /* wgsl */ `
fn bilateralBlur(
  tex: texture_2d<f32>,
  texSampler: sampler,
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  direction: vec2f,
  resolution: vec2f,
  near: f32,
  far: f32,
  sharpness: f32
) -> vec4f {
  // Blur weight based on
  // https://github.com/nvpro-samples/gl_ssao/blob/master/hbao_blur.frag.glsl
  // numSamples = 9, blurRadius = numSamples / 2, blurSigma = blurRadius * 0.5
  // blurFalloff = 1.0 / (2.0 * blurSigma * blurSigma)
  let blurFalloff = 0.09876543210;

  var color = vec4f(0.0);
  var weightSum = 0.0;

  let centerDepth = readDepth(depthTex, depthSampler, uv, near, far);

  for (var i = -8; i <= 8; i += 2) {
    let r = f32(i);
    let sampleUV = uv + (direction * r) / resolution;

    let sampleDepth = readDepth(depthTex, depthSampler, sampleUV, near, far);
    let diff = (sampleDepth - centerDepth) * sharpness;
    let weight = exp2(-r * r * blurFalloff - diff * diff);

    weightSum += weight;
    color += textureSampleLevel(tex, texSampler, sampleUV, 0.0) * weight;
  }

  return color / weightSum;
}
`;
