import * as glslToneMap from "glsl-tone-map";

import SHADERS from "../chunks/index.js";

export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

// Variables
// assuming texture in Linear Space
// most likely HDR or Texture2D with sRGB Ext
uniform sampler2D uEnvMap;
uniform int uEnvMapEncoding;
uniform float uEnvMapSize;
uniform int uOutputEncoding;
uniform float uBackgroundBlur;

varying vec3 wcNormal;

uniform float uExposure;

// Includes
${SHADERS.math.PI}
${SHADERS.math.TWO_PI}

${SHADERS.rgbm}
${SHADERS.gamma}
${SHADERS.encodeDecode}
${SHADERS.envMapEquirect}
${SHADERS.octMap}
${SHADERS.irradiance}
${Object.values(glslToneMap).join("\n")}

void main() {
  vec3 N = normalize(wcNormal);

  vec4 color = vec4(0.0);

  if (uBackgroundBlur <= 0.0) {
    color = decode(texture2D(uEnvMap, envMapEquirect(N)), uEnvMapEncoding);
  } else {
    color = vec4(getIrradiance(N, uEnvMap, uEnvMapSize, uEnvMapEncoding), 1.0);
  }

  color.rgb *= uExposure;

  #if defined(TONEMAP)
    color.rgb = TONEMAP(color.rgb);
  #endif

  gl_FragData[0] = encode(color, uOutputEncoding);
  #ifdef USE_DRAW_BUFFERS
    gl_FragData[1] = vec4(0.0);
    gl_FragData[2] = vec4(0.0);
  #endif

  ${SHADERS.output.assignment}
}
`;
