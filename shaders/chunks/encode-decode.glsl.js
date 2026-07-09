export default /* glsl */ `
#define LINEAR 1
#define GAMMA 2
#define SRGB 3

float linearToSrgb(float c) {
  return (c <= 0.0031308) ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
float srgbToLinear(float c) {
  return (c > 0.04045) ? pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

// Linear
float toLinear(float v) {
  return srgbToLinear(v);
}
vec2 toLinear(vec2 v) {
  return vec2(srgbToLinear(v.r), srgbToLinear(v.g));
}
vec3 toLinear(vec3 v) {
  return vec3(srgbToLinear(v.r), srgbToLinear(v.g), srgbToLinear(v.b));
}
vec4 toLinear(vec4 v) {
  return vec4(toLinear(v.rgb), v.a);
}

// Gamma
float toGamma(float v) {
  return linearToSrgb(v);
}
vec2 toGamma(vec2 v) {
  return vec2(linearToSrgb(v.r), linearToSrgb(v.g));
}
vec3 toGamma(vec3 v) {
  return vec3(linearToSrgb(v.r), linearToSrgb(v.g), linearToSrgb(v.b));
}
vec4 toGamma(vec4 v) {
  return vec4(toGamma(v.rgb), v.a);
}

vec4 decode(vec4 pixel, int encoding) {
  if (encoding == LINEAR) return pixel;
  if (encoding == GAMMA) return toLinear(pixel);
  if (encoding == SRGB) return toLinear(pixel);
  return pixel;
}

vec4 encode(vec4 pixel, int encoding) {
  if (encoding == LINEAR) return pixel;
  if (encoding == GAMMA) return toGamma(pixel);
  if (encoding == SRGB) return toGamma(pixel);
  return pixel;
}
`;
