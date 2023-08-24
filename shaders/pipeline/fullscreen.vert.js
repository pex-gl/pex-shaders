import SHADERS from "../chunks/index.js";

export default /* glsl */ `
${SHADERS.output.vert}

attribute vec2 aPosition;
attribute vec2 aTexCoord0;

varying vec2 vTexCoord0;

#define HOOK_VERT_DECLARATIONS_END

void main() {
  vTexCoord0 = aTexCoord0;
  gl_Position = vec4(aPosition, 0.0, 1.0);

  #define HOOK_VERT_END
}
`;
