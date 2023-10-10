import SHADERS from "../chunks/index.js";

/**
 * Up Sample
 * Reference Implementation: https://github.com/keijiro/KinoBloom
 */
export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform vec2 uTexelSize;

varying vec2 vTexCoord0LeftUp;
varying vec2 vTexCoord0RightUp;
varying vec2 vTexCoord0LeftDown;
varying vec2 vTexCoord0RightDown;

#if QUALITY == 1
  varying vec2 vTexCoord0;
  varying vec2 vTexCoord0Down;
  varying vec2 vTexCoord0Up;
  varying vec2 vTexCoord0Left;
  varying vec2 vTexCoord0Right;
#endif

void main () {
  // 4-tap bilinear upsampler
  #if QUALITY == 0
    gl_FragColor = vec4(
      (
        texture2D(uTexture, vTexCoord0LeftDown).rgb * 0.25 +
        texture2D(uTexture, vTexCoord0RightDown).rgb * 0.25 +
        texture2D(uTexture, vTexCoord0LeftUp).rgb * 0.25 +
        texture2D(uTexture, vTexCoord0RightUp).rgb * 0.25
      ),
      1.0
    );
  // 9-tap bilinear upsampler (tent filter)
  #else
    gl_FragColor = vec4(
      (
        texture2D(uTexture, vTexCoord0LeftDown).rgb * 0.0625 +
        texture2D(uTexture, vTexCoord0Left).rgb * 0.125 +
        texture2D(uTexture, vTexCoord0RightDown).rgb * 0.0625 +
        texture2D(uTexture, vTexCoord0Down).rgb * 0.125 +
        texture2D(uTexture, vTexCoord0).rgb * 0.25 +
        texture2D(uTexture, vTexCoord0Up).rgb * 0.125 +
        texture2D(uTexture, vTexCoord0LeftUp).rgb * 0.0625 +
        texture2D(uTexture, vTexCoord0Right).rgb * 0.125 +
        texture2D(uTexture, vTexCoord0RightUp).rgb * 0.0625
      ),
      1.0
    );
  #endif

  ${SHADERS.output.assignment}
}
`;
