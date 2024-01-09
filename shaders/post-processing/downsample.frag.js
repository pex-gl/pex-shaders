import * as SHADERS from "../chunks/index.js";

/**
 * Downsample
 * Reference Implementation: https://github.com/keijiro/KinoBloom
 */
export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;

uniform float uIntensity;

varying vec2 vTexCoord0;

varying vec2 vTexCoord0LeftUp;
varying vec2 vTexCoord0RightUp;
varying vec2 vTexCoord0LeftDown;
varying vec2 vTexCoord0RightDown;

float Brightness(vec3 c) {
  return max(max(c.r, c.g), c.b);
}

void main () {
  // Downsample with a 4x4 box filter
  #if QUALITY == 0
    gl_FragColor = (
      texture2D(uTexture, vTexCoord0LeftDown) +
      texture2D(uTexture, vTexCoord0RightDown) +
      texture2D(uTexture, vTexCoord0) +
      texture2D(uTexture, vTexCoord0LeftUp) +
      texture2D(uTexture, vTexCoord0RightUp)
    ) / 5.0 * uIntensity;

  // Downsample with a 4x4 box filter + anti-flicker filter
  #else
    vec4 s1 = texture2D(uTexture, vTexCoord0LeftDown);
    vec4 s2 = texture2D(uTexture, vTexCoord0RightDown);
    vec4 s3 = texture2D(uTexture, vTexCoord0LeftUp);
    vec4 s4 = texture2D(uTexture, vTexCoord0RightUp);

    // Karis's luma weighted average (using brightness instead of luma)
    float s1w = 1.0 / (Brightness(s1.xyz) + 1.0);
    float s2w = 1.0 / (Brightness(s2.xyz) + 1.0);
    float s3w = 1.0 / (Brightness(s3.xyz) + 1.0);
    float s4w = 1.0 / (Brightness(s4.xyz) + 1.0);
    float one_div_wsum = 1.0 / (s1w + s2w + s3w + s4w);

    gl_FragColor = (
      (s1 * s1w + s2 * s2w + s3 * s3w + s4 * s4w) * one_div_wsum
    ) * uIntensity;
  #endif

  ${SHADERS.output.assignment}
}
`;
