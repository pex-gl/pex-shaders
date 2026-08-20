/**
 * Upsample
 *
 * Neighbor UVs are taken as parameters rather than recomputed from a base UV
 * and texel size: the composing pipeline computes and interpolates them in
 * the vertex stage (free via rasterization) instead of paying for the
 * add/multiply per tap in the fragment stage.
 *
 * Reference Implementation: https://github.com/keijiro/KinoBloom
 *
 * @type {string}
 * @alias module:chunks.upsample
 */
export default /* wgsl */ `
// 4-tap bilinear upsampler
fn upsampleBilinear(
  tex: texture_2d<f32>,
  texSampler: sampler,
  uvLeftUp: vec2f,
  uvRightUp: vec2f,
  uvLeftDown: vec2f,
  uvRightDown: vec2f
) -> vec4f {
  return vec4f(
    textureSampleLevel(tex, texSampler, uvLeftDown, 0.0).rgb * 0.25 +
    textureSampleLevel(tex, texSampler, uvRightDown, 0.0).rgb * 0.25 +
    textureSampleLevel(tex, texSampler, uvLeftUp, 0.0).rgb * 0.25 +
    textureSampleLevel(tex, texSampler, uvRightUp, 0.0).rgb * 0.25,
    1.0
  );
}

// 9-tap bilinear upsampler (tent filter)
fn upsampleTent(
  tex: texture_2d<f32>,
  texSampler: sampler,
  uv: vec2f,
  uvDown: vec2f,
  uvUp: vec2f,
  uvLeft: vec2f,
  uvRight: vec2f,
  uvLeftUp: vec2f,
  uvRightUp: vec2f,
  uvLeftDown: vec2f,
  uvRightDown: vec2f
) -> vec4f {
  return vec4f(
    textureSampleLevel(tex, texSampler, uvLeftDown, 0.0).rgb * 0.0625 +
    textureSampleLevel(tex, texSampler, uvLeft, 0.0).rgb * 0.125 +
    textureSampleLevel(tex, texSampler, uvRightDown, 0.0).rgb * 0.0625 +
    textureSampleLevel(tex, texSampler, uvDown, 0.0).rgb * 0.125 +
    textureSampleLevel(tex, texSampler, uv, 0.0).rgb * 0.25 +
    textureSampleLevel(tex, texSampler, uvUp, 0.0).rgb * 0.125 +
    textureSampleLevel(tex, texSampler, uvLeftUp, 0.0).rgb * 0.0625 +
    textureSampleLevel(tex, texSampler, uvRight, 0.0).rgb * 0.125 +
    textureSampleLevel(tex, texSampler, uvRightUp, 0.0).rgb * 0.0625,
    1.0
  );
}
`;
