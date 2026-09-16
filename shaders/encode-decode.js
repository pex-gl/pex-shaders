export default /* wgsl */ `
const LINEAR: i32 = 1;
const GAMMA: i32 = 2;
const SRGB: i32 = 3;

fn linearToSrgb(c: f32) -> f32 {
  return select(1.055 * pow(c, 1.0 / 2.4) - 0.055, 12.92 * c, c <= 0.0031308);
}
fn srgbToLinear(c: f32) -> f32 {
  return select(c / 12.92, pow((c + 0.055) / 1.055, 2.4), c > 0.04045);
}

// Linear
fn toLinearF32(v: f32) -> f32 {
  return srgbToLinear(v);
}
fn toLinearVec2(v: vec2f) -> vec2f {
  return vec2f(srgbToLinear(v.x), srgbToLinear(v.y));
}
fn toLinearVec3(v: vec3f) -> vec3f {
  return vec3f(srgbToLinear(v.x), srgbToLinear(v.y), srgbToLinear(v.z));
}
fn toLinearVec4(v: vec4f) -> vec4f {
  return vec4f(toLinearVec3(v.xyz), v.w);
}

// Gamma
fn toGammaF32(v: f32) -> f32 {
  return linearToSrgb(v);
}
fn toGammaVec2(v: vec2f) -> vec2f {
  return vec2f(linearToSrgb(v.x), linearToSrgb(v.y));
}
fn toGammaVec3(v: vec3f) -> vec3f {
  return vec3f(linearToSrgb(v.x), linearToSrgb(v.y), linearToSrgb(v.z));
}
fn toGammaVec4(v: vec4f) -> vec4f {
  return vec4f(toGammaVec3(v.xyz), v.w);
}

fn decode(pixel: vec4f, encoding: i32) -> vec4f {
  if (encoding == GAMMA || encoding == SRGB) {
    return toLinearVec4(pixel);
  }
  return pixel;
}

fn encode(pixel: vec4f, encoding: i32) -> vec4f {
  if (encoding == GAMMA || encoding == SRGB) {
    return toGammaVec4(pixel);
  }
  return pixel;
}
`;
