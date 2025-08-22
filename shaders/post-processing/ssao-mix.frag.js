import * as SHADERS from "../chunks/index.js";

/**
 * SSAO mix
 *
 * @alias module:postProcessing.ssaoMix.frag
 * @type {string}
 */
export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform vec2 uViewportSize;

uniform sampler2D uSSAOTexture;
uniform float uSSAOMix;

${SHADERS.ambientOcclusion}

void main () {
  vec2 vUV = gl_FragCoord.xy / uViewportSize;

  gl_FragColor = ssao(texture2D(uTexture, vUV), texture2D(uSSAOTexture, vUV), uSSAOMix);

  ${SHADERS.output.assignment}
}
`;
