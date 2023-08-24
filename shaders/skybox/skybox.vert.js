import SHADERS from "../chunks/index.js";

// Based on http://gamedev.stackexchange.com/questions/60313/implementing-a-skybox-with-glsl-version-330
export default /* glsl */ `
${SHADERS.output.vert}

attribute vec2 aPosition;

${SHADERS.math.inverseMat4}
${SHADERS.math.transposeMat3}

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;

varying vec3 wcNormal;

void main() {
  mat4 inverseProjection = inverse(uProjectionMatrix);
  mat3 inverseModelview = transpose(mat3(uViewMatrix));
  vec3 unprojected = (inverseProjection * vec4(aPosition, 0.0, 1.0)).xyz;
  wcNormal = (uModelMatrix * vec4(inverseModelview * unprojected, 1.0)).xyz;

  gl_Position = vec4(aPosition, 0.9999, 1.0);
}
`;
