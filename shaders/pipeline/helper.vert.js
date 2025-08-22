import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:pipeline.helper.vert
 * @type {string}
 */
export default /* glsl */ `
${SHADERS.output.vert}

attribute vec3 aPosition;
attribute vec4 aVertexColor;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

varying vec4 vColor;

#define HOOK_VERT_DECLARATIONS_END

void main () {
  vColor = aVertexColor;
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);

  #define HOOK_VERT_END
}
`;
