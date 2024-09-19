import * as glslToneMap from "glsl-tone-map";

import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:postProcessing.postProcessing.frag
 * @type {string}
 */
export default /* glsl */ `precision highp float;

${SHADERS.output.frag}

// Variables
uniform sampler2D uTexture;
uniform sampler2D uDepthTexture;
uniform vec4 uViewport;
uniform vec2 uViewportSize;
uniform vec2 uTexelSize;
uniform float uTime;

// uniform int uTextureEncoding;

// Camera
uniform mat4 uViewMatrix;
// TODO: group in vec4
uniform float uNear;
uniform float uFar;
uniform float uFov;
uniform float uExposure;
uniform int uOutputEncoding;

// Includes
${SHADERS.math.PI}
${SHADERS.math.saturate}
${SHADERS.encodeDecode}
${SHADERS.depthRead}
${Object.values(glslToneMap).join("\n")}

#if defined(USE_AA) || defined(USE_FILM_GRAIN)
  ${SHADERS.luma}
#endif

#ifdef USE_FOG
  uniform float uFogStart;
  uniform vec3 uSunPosition;

  ${SHADERS.depthPosition}
  ${SHADERS.fog}
#endif

#ifdef USE_AA
  // FXAA blends anything that has high enough contrast. It helps mitigate fireflies but will blur small details.
  // - 1.00: upper limit (softer)
  // - 0.75: default amount of filtering
  // - 0.50: lower limit (sharper, less sub-pixel aliasing removal)
  // - 0.25: almost off
  // - 0.00: completely off
  uniform float uSubPixelQuality;
  ${SHADERS.fxaa}
#endif

#ifdef USE_SSAO
  uniform sampler2D uSSAOTexture;
  uniform float uSSAOMix;

  ${SHADERS.ambientOcclusion}
#endif

#ifdef USE_BLOOM
  uniform sampler2D uBloomTexture;
  uniform float uBloomIntensity;
#endif

#ifdef USE_FILM_GRAIN
  uniform float uFilmGrainSize;
  uniform float uFilmGrainIntensity;
  uniform float uFilmGrainColorIntensity;
  uniform float uFilmGrainLuminanceIntensity;
  uniform float uFilmGrainSpeed;

  ${SHADERS.noise.common}
  ${SHADERS.noise.simplex}
  ${SHADERS.noise.perlin}
  ${SHADERS.math.random}
  ${SHADERS.filmGrain}
#endif

#ifdef USE_LUT
  uniform sampler2D uLUTTexture;
  uniform float uLUTTextureSize;

  ${SHADERS.lut}
#endif

#ifdef USE_COLOR_CORRECTION
  // TODO: group in vec4
  uniform float uBrightness;
  uniform float uContrast;
  uniform float uSaturation;
  uniform float uHue;

  ${SHADERS.colorCorrection}
#endif

#ifdef USE_VIGNETTE
  uniform float uVignetteRadius;
  uniform float uVignetteIntensity;

  ${SHADERS.vignette}
#endif

uniform float uOpacity;

varying vec2 vTexCoord0;

#if defined(USE_AA)
  varying vec2 vTexCoord0LeftUp;
  varying vec2 vTexCoord0RightUp;
  varying vec2 vTexCoord0LeftDown;
  varying vec2 vTexCoord0RightDown;
  varying vec2 vTexCoord0Down;
  varying vec2 vTexCoord0Up;
  varying vec2 vTexCoord0Left;
  varying vec2 vTexCoord0Right;
#endif

void main() {
  vec4 color = vec4(0.0);

  vec2 uv = vTexCoord0;

  // Anti-aliasing
  #ifdef USE_AA
    color = fxaa(
      uTexture,
      uv,
      vTexCoord0LeftUp,
      vTexCoord0RightUp,
      vTexCoord0LeftDown,
      vTexCoord0RightDown,
      vTexCoord0Down,
      vTexCoord0Up,
      vTexCoord0Left,
      vTexCoord0Right,
      uTexelSize,
      uSubPixelQuality
    );
  #else
    color = texture2D(uTexture, uv);
  #endif

  // color = decode(color, uTextureEncoding);

  // HDR effects
  #ifdef USE_FOG
    float z = readDepth(uDepthTexture, uv, uNear, uFar);
    vec3 pos = reconstructPositionFromDepth(uv, z);
    float rayLength = length(pos);
    vec3 rayDir = pos / rayLength;
    vec3 sunDir = normalize(vec3(uViewMatrix * vec4(normalize(uSunPosition), 0.0)));
    color.rgb = fog(color.rgb, rayLength - uFogStart, rayDir, sunDir);
  #endif

  #ifdef USE_SSAO
    color = ssao(color, texture2D(uSSAOTexture, uv), uSSAOMix);
  #endif

  #ifdef USE_BLOOM
    color.rgb += texture2D(uBloomTexture, uv).rgb * uBloomIntensity;
  #endif

  // Tonemapping and gamma conversion
  color.rgb *= uExposure;

  #if defined(TONE_MAP)
    color.rgb = TONE_MAP(color.rgb);
    color.rgb = saturate(color.rgb);
  #endif

  color = encode(color, uOutputEncoding);

  // LDR effects
  #ifdef USE_FILM_GRAIN
    color.rgb = filmGrain(
      color.rgb,
      uv,
      uViewportSize,
      uFilmGrainSize,
      uFilmGrainIntensity,
      uFilmGrainColorIntensity,
      uFilmGrainLuminanceIntensity,
      floor(uTime * uFilmGrainSpeed * 60.0)
    );
  #endif

  #ifdef USE_LUT
    color.rgb = lut(vec4(color.rgb, 1.0), uLUTTexture, uLUTTextureSize).rgb;
  #endif

  #ifdef USE_COLOR_CORRECTION
    color.rgb = brightnessContrast(color.rgb, uBrightness, uContrast);
    color.rgb = saturation(color.rgb, uSaturation);
    color.rgb = hue(color.rgb, uHue / 180.0 * PI);
  #endif

  #ifdef USE_VIGNETTE
    color.rgb = vignette(color.rgb, uv, uVignetteRadius, uVignetteIntensity);
  #endif

  gl_FragColor = color;
  gl_FragColor.a *= uOpacity;

  ${SHADERS.output.assignment}
}
`;
