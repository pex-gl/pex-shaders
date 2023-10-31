import * as SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uOctMap;
uniform float uOctMapSize;
uniform float uSourceRegionSize;

varying vec2 vTexCoord0;

void main() {
  vec2 uv = vTexCoord0;
  uv *= uSourceRegionSize / uOctMapSize;

  gl_FragColor = texture2D(uOctMap, uv);

  ${SHADERS.output.assignment}
}
`;
