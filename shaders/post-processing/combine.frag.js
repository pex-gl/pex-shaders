import * as glslToneMap from "glsl-tone-map";

import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:postProcessing.combine.frag
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

// Camera
uniform mat4 uViewMatrix;
// TODO: group in vec4
uniform float uNear;
uniform float uFar;
uniform float uFov;
uniform float uExposure;

// Includes
${SHADERS.math.PI}
${SHADERS.math.saturate}
${SHADERS.encodeDecode}
${SHADERS.depthRead}
${Object.values(glslToneMap).join("\n")}
${SHADERS.math.max3}
${SHADERS.reversibleToneMap}

#ifdef USE_FOG
  uniform float uFogStart;
  uniform vec3 uSunPosition;

  ${SHADERS.depthPosition}
  ${SHADERS.fog}
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

varying vec2 vTexCoord0;

void main() {
  vec4 color = vec4(0.0);

  vec2 uv = vTexCoord0;
  color = texture2D(uTexture, uv);

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

  color = encode(color, GAMMA);

  // LDR effects
  #ifdef USE_VIGNETTE
    color.rgb = vignette(color.rgb, uv, uVignetteRadius, uVignetteIntensity);
  #endif

  #ifdef USE_LUT
    color.rgb = lut(vec4(color.rgb, 1.0), uLUTTexture, uLUTTextureSize).rgb;
  #endif

  #ifdef USE_COLOR_CORRECTION
    color.rgb = brightnessContrast(color.rgb, uBrightness, uContrast);
    color.rgb = saturation(color.rgb, uSaturation);
    color.rgb = hue(color.rgb, uHue / 180.0 * PI);
  #endif

  gl_FragColor = color;

  ${SHADERS.output.assignment}
}
`;
