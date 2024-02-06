import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:postProcessing.threshold.frag
 * @type {string}
 */
export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform sampler2D uEmissiveTexture;

uniform float uExposure;
uniform float uThreshold;

varying vec2 vTexCoord0;

float perceivedBrightness(vec3 c) {
  return (c.r + c.g + c.b) / 3.0;
  //return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

void main() {
  vec4 color = texture2D(uTexture, vTexCoord0);
  color.rgb *= uExposure;

  float brightness = perceivedBrightness(color.rgb);
  // float smoothRange = 0.1;
  float t1 = uThreshold * 0.9;

  if (brightness > t1) {
    gl_FragColor = color * smoothstep(t1, uThreshold * 1.1, brightness);
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }

  gl_FragColor += texture2D(uEmissiveTexture, vTexCoord0);

  ${SHADERS.output.assignment}
}
`;
