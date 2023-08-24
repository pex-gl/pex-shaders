import SHADERS from "../chunks/index.js";

export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

uniform vec4 uBaseColor;

varying vec4 vColor;

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  gl_FragData[0] = uBaseColor * vColor;

  #ifdef USE_DRAW_BUFFERS
    gl_FragData[1] = vec4(0.0);
    gl_FragData[2] = vec4(0.0);
  #endif

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}
`;
