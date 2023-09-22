import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

// Variables
uniform sampler2D uTexture;
uniform sampler2D uDepthTexture;
uniform vec4 uViewport;
uniform vec2 uViewportSize;

uniform int uTextureEncoding;

// Camera
uniform mat4 uViewMatrix;
// TODO: group in vec4
uniform float uNear;
uniform float uFar;
uniform float uFov;
uniform float uExposure;

// Fog
uniform bool uFog;
uniform float uFogStart;
uniform vec3 uSunPosition;

// AA
uniform bool uFXAA;

// Bloom
uniform sampler2D uBloomTexture;
uniform bool uBloom;
uniform float uBloomIntensity;

// LUT
uniform bool uLUT;
uniform sampler2D uLUTTexture;
uniform float uLUTTextureSize;

// Color correction
uniform bool uColorCorrection;
// TODO: group in vec4
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uHue;

// Vignette
uniform bool uVignette;
uniform float uVignetteRadius;
uniform float uVignetteIntensity;

uniform float uOpacity;

uniform int uOutputEncoding;

varying vec2 vTexCoord0;

// Includes
${SHADERS.math.PI}
${SHADERS.rgbm}
${SHADERS.gamma}
${SHADERS.encodeDecode}
${SHADERS.depthRead}
${SHADERS.fxaa}
${SHADERS.lut}
${SHADERS.colorCorrection}
${SHADERS.vignette}
${SHADERS.fog}

vec3 tonemapAces( vec3 x ) {
  float tA = 2.5;
  float tB = 0.03;
  float tC = 2.43;
  float tD = 0.59;
  float tE = 0.14;
  return clamp((x*(tA*x+tB))/(x*(tC*x+tD)+tE),0.0,1.0);
}

// HDR [0, Infinity) -> LDR [0, 1)
// vec3 reinhard(vec3 x) {
//   return x / (1.0 + x);
// }

// LDR -> HDR
// Do I need more complex like: https://github.com/libretro/slang-shaders/blob/master/bezel/Mega_Bezel/shaders/megatron/include/inverse_tonemap.h
vec3 reinhardInverse(vec3 x) {
  // return x / (1.0 - x);
  // https://github.com/luluco250/FXShaders/blob/master/Shaders/FXShaders/Tonemap.fxh
  // return -(x / min(x - 1.0, -0.1));
  return x / max(vec3(1.0) - x, 0.001);
}

vec3 getFarViewDir(vec2 tc) {
  float hfar = 2.0 * tan(uFov/2.0) * uFar;
  float wfar = hfar * uViewportSize.x / uViewportSize.y;
  vec3 dir = (vec3(wfar * (tc.x - 0.5), hfar * (tc.y - 0.5), -uFar));
  return dir;
}

vec3 reconstructPositionFromDepth(vec2 texCoord, float z) {
  vec3 ray = getFarViewDir(texCoord);
  vec3 pos = ray;
  return pos * z / uFar;
}

void main() {
  vec4 color = vec4(0.0);

  vec2 uv = vTexCoord0;

  // Anti-aliasing
  if (uFXAA) {
    // LDR
    color = fxaa(uTexture, uv * uViewportSize, uViewportSize);
    color.rgb = reinhardInverse(color.rgb);
  } else {
    color = texture2D(uTexture, uv);
  }

  // HDR effects
  if (uFog) {
    float z = readDepth(uDepthTexture, uv, uNear, uFar);
    vec3 pos = reconstructPositionFromDepth(uv, z);
    float rayLength = length(pos);
    vec3 rayDir = pos / rayLength;
    vec3 sunDir = normalize(vec3(uViewMatrix * vec4(normalize(uSunPosition), 0.0)));
    color.rgb = fog(color.rgb, rayLength - uFogStart, rayDir, sunDir);
  }

  if (uBloom) {
    color.rgb += texture2D(uBloomTexture, uv).rgb * uBloomIntensity;
  }

  color.rgb *= uExposure;

  // Tonemapping and gamma conversion
  // TODO: custom tonemap
  color.rgb = tonemapAces(color.rgb);
  color.rgb = min(vec3(1.0), max(vec3(0.0), color.rgb));
  color.rgb = toGamma(color.rgb);

  // LDR effects
  if (uLUT) {
    color.rgb = lut(vec4(color.rgb, 1.0), uLUTTexture, uLUTTextureSize).rgb;
  }

  if (uColorCorrection) {
    color.rgb = brightnessContrast(color.rgb, uBrightness, uContrast);
    color.rgb = saturation(color.rgb, uSaturation);
    color.rgb = hue(color.rgb, uHue / 180.0 * PI);
  }

  if (uVignette) {
    color.rgb = vignette(color.rgb, uv, uVignetteRadius, uVignetteIntensity);
  }

  gl_FragColor = color;

  gl_FragColor = encode(color, uOutputEncoding);
  gl_FragColor.a *= uOpacity;

  ${SHADERS.output.assignment}
}
`;
