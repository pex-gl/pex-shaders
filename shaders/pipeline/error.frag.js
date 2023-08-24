import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision mediump float;

${SHADERS.output.frag}

#define HOOK_FRAG_DECLARATIONS_END

void main () {
  gl_FragData[0] = vec4(1.0, 0.0, 0.0, 1.0);

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}
`;
