/**
 * Downsample
 *
 * Neighbor UVs are taken as parameters rather than recomputed from a base UV
 * and texel size: the composing pipeline computes and interpolates them in the
 * vertex stage (free via rasterization) instead of paying for the add/multiply
 * per tap in the fragment stage.
 *
 * Reference Implementation: https://github.com/keijiro/KinoBloom
 *
 * @type {string}
 * @alias module:shaders.downsample
 */
export default /* wgsl */ `
// 4x4 box filter
fn downsampleBox(
  tex: texture_2d<f32>,
  texSampler: sampler,
  uv: vec2f,
  uvLeftUp: vec2f,
  uvRightUp: vec2f,
  uvLeftDown: vec2f,
  uvRightDown: vec2f,
  intensity: f32
) -> vec4f {
  return (
    textureSampleLevel(tex, texSampler, uvLeftDown, 0.0) +
    textureSampleLevel(tex, texSampler, uvRightDown, 0.0) +
    textureSampleLevel(tex, texSampler, uv, 0.0) +
    textureSampleLevel(tex, texSampler, uvLeftUp, 0.0) +
    textureSampleLevel(tex, texSampler, uvRightUp, 0.0)
  ) / 5.0 * intensity;
}

// 4x4 box filter + Karis's luma weighted average anti-flicker filter (using
// max component brightness instead of luma)
fn downsampleBoxAntiFlicker(
  tex: texture_2d<f32>,
  texSampler: sampler,
  uvLeftUp: vec2f,
  uvRightUp: vec2f,
  uvLeftDown: vec2f,
  uvRightDown: vec2f,
  intensity: f32
) -> vec4f {
  let s1 = textureSampleLevel(tex, texSampler, uvLeftDown, 0.0);
  let s2 = textureSampleLevel(tex, texSampler, uvRightDown, 0.0);
  let s3 = textureSampleLevel(tex, texSampler, uvLeftUp, 0.0);
  let s4 = textureSampleLevel(tex, texSampler, uvRightUp, 0.0);

  let s1w = 1.0 / (max3(s1.xyz) + 1.0);
  let s2w = 1.0 / (max3(s2.xyz) + 1.0);
  let s3w = 1.0 / (max3(s3.xyz) + 1.0);
  let s4w = 1.0 / (max3(s4.xyz) + 1.0);
  let oneDivWSum = 1.0 / (s1w + s2w + s3w + s4w);

  return (s1 * s1w + s2 * s2w + s3 * s3w + s4 * s4w) * oneDivWSum * intensity;
}
`;
