import SHADERS from "../chunks/index.js";

export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

#ifdef USE_DRAW_BUFFERS
  ${SHADERS.gamma}
  ${SHADERS.rgbm}
  ${SHADERS.encodeDecode}
  uniform int uOutputEncoding;
#endif

varying vec4 vColor;

#define HOOK_FRAG_DECLARATIONS_END

void main () {
  #ifdef USE_DRAW_BUFFERS
    gl_FragData[0] = encode(vec4(vColor.rgb * 3.0, 1.0), uOutputEncoding);
    gl_FragData[1] = vec4(0.0);
  #else
    gl_FragData[0] = vColor;
  #endif

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}
`;
