import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:skybox.skybox.frag
 * @type {string}
 */
export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

// Variables
uniform sampler2D uEnvMap; // Linear (eg. HDR in RGBA32F or sky in SRGB8_ALPHA8)
uniform float uEnvMapSize;
uniform float uEnvMapExposure;
uniform float uBackgroundBlur;

varying vec3 wcNormal;

// Includes
${SHADERS.math.PI}
${SHADERS.math.TWO_PI}

${SHADERS.encodeDecode}
${SHADERS.envMapEquirect}
${SHADERS.octMap}
${SHADERS.irradiance}
${SHADERS.math.max3}
${SHADERS.reversibleToneMap}

void main() {
  vec3 N = normalize(wcNormal);

  vec4 color = vec4(0.0);

  if (uBackgroundBlur <= 0.0) {
    color = texture2D(uEnvMap, envMapEquirect(N));
  } else {
    color = vec4(getIrradiance(N, uEnvMap, uEnvMapSize, LINEAR), 1.0);
  }

  color.rgb *= uEnvMapExposure;

  #ifdef USE_MSAA
    color.rgb = reversibleToneMap(color.rgb);
  #endif

  gl_FragData[0] = color;

  #ifdef USE_DRAW_BUFFERS
    #if LOCATION_NORMAL >= 0
      gl_FragData[LOCATION_NORMAL] = vec4(0.0, 0.0, 1.0, 1.0);
    #endif
    #if LOCATION_EMISSIVE >= 0
      gl_FragData[LOCATION_EMISSIVE] = vec4(0.0);
    #endif
  #endif

  ${SHADERS.output.assignment}
}
`;
