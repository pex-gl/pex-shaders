import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:postProcessing.luma.frag
 * @type {string}
 */
export default /* glsl */ `precision highp float;

${SHADERS.output.frag}

// Variables
uniform sampler2D uTexture;

// Includes
${SHADERS.luma}
${SHADERS.encodeDecode}

varying vec2 vTexCoord0;

void main() {
  vec4 color = texture2D(uTexture, vTexCoord0);

  gl_FragData[0].r = luma(encode(color, SRGB).rgb);

  ${SHADERS.output.assignment}
}
`;
