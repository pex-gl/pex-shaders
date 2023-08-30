import SHADERS from "../chunks/index.js";

export default /* glsl */ `precision highp float;

${SHADERS.output.frag}

uniform vec4 uBaseColor;

#if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
varying vec4 vColor;
#endif

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  #if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
    gl_FragData[0] = vColor * uBaseColor;
  #else
    gl_FragData[0] = uBaseColor;
  #endif

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}`;
