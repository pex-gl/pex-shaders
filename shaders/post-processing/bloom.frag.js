import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform vec2 uViewportSize;
// TODO: uViewportSize vs uSize

varying vec2 vTexCoord0;

vec3 sampleBloom (sampler2D texture, vec2 uv) {
  vec3 color = vec3(0.0);
  vec2 s = 1.0 / uViewportSize;
  color += texture2D(texture, uv + vec2(-1.0, -1.0) * s).rgb;
  color += texture2D(texture, uv + vec2( 0.0, -1.0) * s).rgb;
  color += texture2D(texture, uv + vec2( 1.0, -1.0) * s).rgb;
  color += texture2D(texture, uv + vec2( 0.0, -1.0) * s).rgb;
  color += texture2D(texture, uv + vec2( 0.0,  0.0) * s).rgb;
  color += texture2D(texture, uv + vec2( 0.0,  1.0) * s).rgb;
  color += texture2D(texture, uv + vec2(-1.0,  1.0) * s).rgb;
  color += texture2D(texture, uv + vec2( 0.0,  1.0) * s).rgb;
  color += texture2D(texture, uv + vec2( 1.0,  1.0) * s).rgb;
  color /= 9.0;
  return color;
}

void main () {
  gl_FragColor.rgb = sampleBloom(uTexture, vTexCoord0);
  gl_FragColor.a = 1.0;

  ${SHADERS.output.assignment}
}
`;
