import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

${SHADERS.octMapUvToDir}

varying vec2 vTexCoord0;

uniform samplerCube uCubemap;
uniform float uTextureSize;

void main() {
  vec3 N = octMapUVToDir(vTexCoord0, uTextureSize);
  gl_FragColor = textureCube(uCubemap, N);

  ${SHADERS.output.assignment}
}
`;
