import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:reflectionProbe.cubemapToOctMap.frag
 * @type {string}
 */
export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

${SHADERS.octMapUvToDir}

uniform samplerCube uCubemap;
uniform float uTextureSize;

varying vec2 vTexCoord0;

void main() {
  vec3 N = octMapUVToDir(vTexCoord0, uTextureSize);
  gl_FragColor = textureCube(uCubemap, N);

  ${SHADERS.output.assignment}
}
`;
