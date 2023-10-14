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

uniform float uExposure;
uniform int uOutputEncoding;

varying vec4 vColor;

// Includes
${SHADERS.rgbm}
${SHADERS.gamma}
${SHADERS.encodeDecode}
${Object.values(glslToneMap).join("\n")}

#define HOOK_FRAG_DECLARATIONS_END

void main () {
  vec4 color = vec4(vColor.rgb, 1.0);

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

  #define HOOK_FRAG_END
}
`;
