import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform sampler2D uEmissiveTexture;
uniform vec2 uViewportSize;

uniform float uExposure;
uniform float uThreshold;

varying vec2 vTexCoord;

float perceivedBrightness(vec3 c) {
  return (c.r + c.g + c.b) / 3.0;
  //return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

void main() {
  vec2 vUV = vec2(gl_FragCoord.x / uViewportSize.x, gl_FragCoord.y / uViewportSize.y);
  vec4 color = texture2D(uTexture, vUV);
  color.rgb *= uExposure;
  float brightness = perceivedBrightness(color.rgb);
  float smoothRange = 0.1;
  float t1 = uThreshold * (1.0 - smoothRange);
  float t2 = uThreshold * (1.0 + smoothRange);
  if (brightness > t1) {
    gl_FragColor = color * smoothstep(t1, t2, brightness);
  } else {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }

  gl_FragColor += texture2D(uEmissiveTexture, vUV);

  ${SHADERS.output.assignment}
}
`;
