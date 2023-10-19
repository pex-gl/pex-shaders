import * as glslToneMap from "glsl-tone-map";

import SHADERS from "../chunks/index.js";

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
${SHADERS.rgbm}
${SHADERS.gamma}
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
  ${SHADERS.fxaa}
#endif

#ifdef USE_SSAO_POST
  uniform sampler2D uSSAOTexture;
  uniform float uSSAOMix;
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

// LDR -> HDR
// Do I need more complex like: https://github.com/libretro/slang-shaders/blob/master/bezel/Mega_Bezel/shaders/megatron/include/inverse_tonemap.h
vec3 reinhardInverse(vec3 x) {
  // return x / (1.0 - x);
  // https://github.com/luluco250/FXShaders/blob/master/Shaders/FXShaders/Tonemap.fxh
  // return -(x / min(x - 1.0, -0.1));
  return x / max(vec3(1.0) - x, 0.001);
}

vec3 gtaoMultiBounce(float ao, vec3 albedo) {
  vec3 x = vec3(ao);

  vec3 a = 2.0404 * albedo - vec3( 0.3324 );
  vec3 b = -4.7951 * albedo + vec3( 0.6417 );
  vec3 c = 2.7552 * albedo + vec3( 0.6903 );

  return max(x, ((x * a + b ) * x + c) * x);
}

void main() {
  vec4 color = vec4(0.0);

  vec2 uv = vTexCoord0;

  // Anti-aliasing
  #ifdef USE_AA
    // LDR
    #ifdef USE_FXAA_3
      color = fxaa3(uTexture, uv, uViewportSize);
    #endif
    #ifdef USE_FXAA_2
      color = fxaa2(uTexture, uv, uViewportSize);
    #endif
    color.rgb = reinhardInverse(color.rgb);
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

  #ifdef USE_SSAO_POST
    vec4 aoData = texture2D(uSSAOTexture, uv);

    #ifdef USE_SSAO_COLORS
      vec3 rgb = mix(color.rgb, color.rgb * gtaoMultiBounce(aoData.a, color.rgb), uSSAOMix);
      color.rgb = vec3(rgb + aoData.rgb * color.rgb * 2.0);
      // color.rgb = vec3(color.rgb * (0.25 + 0.75 * aoData.a) + aoData.rgb * color.rgb * 2.0);
    #else
      color.rgb *= mix(vec3(1.0), vec3(aoData.r), uSSAOMix);
    #endif
  #endif

  #ifdef USE_BLOOM
    color.rgb += texture2D(uBloomTexture, uv).rgb * uBloomIntensity;
  #endif

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

  // Tonemapping and gamma conversion
  color.rgb *= uExposure;

  #if defined(TONEMAP)
    color.rgb = TONEMAP(color.rgb);
    color.rgb = saturate(color.rgb);
  #endif

  color = encode(color, uOutputEncoding);

  // LDR effects
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
