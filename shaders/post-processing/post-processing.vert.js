import SHADERS from "../chunks/index.js";

export default /* glsl */ `
${SHADERS.output.vert}

attribute vec2 aPosition;

uniform vec2 uViewportSize;

varying vec2 vTexCoord0;

#ifdef USE_AA
  #if defined(USE_FXAA_2) || defined(USE_FXAA_3)
    varying vec2 vTexCoord0LeftUp;
    varying vec2 vTexCoord0RightUp;
    varying vec2 vTexCoord0LeftDown;
    varying vec2 vTexCoord0RightDown;
    varying vec2 vTexCoord0Center;
  #endif
  #ifdef USE_FXAA_3
    varying vec2 vTexCoord0Down;
    varying vec2 vTexCoord0Up;
    varying vec2 vTexCoord0Left;
    varying vec2 vTexCoord0Right;
  #endif
#endif

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vTexCoord0 = vec2((aPosition + 1.0) / 2.0);

  #ifdef USE_AA
    vec2 texelSize = 1.0 / uViewportSize;

    #if defined(USE_FXAA_2) || defined(USE_FXAA_3)
      vTexCoord0LeftUp = vTexCoord0 + texelSize * vec2(-1.0, 1.0);
      vTexCoord0RightUp = vTexCoord0 + texelSize * vec2(1.0, 1.0);
      vTexCoord0LeftDown = vTexCoord0 + texelSize * vec2(-1.0, -1.0);
      vTexCoord0RightDown = vTexCoord0 + texelSize * vec2(1.0, -1.0);
    #endif

    #ifdef USE_FXAA_3
      vTexCoord0Down = vTexCoord0 + texelSize * vec2(0.0, -1.0);
      vTexCoord0Up = vTexCoord0 + texelSize * vec2(0.0, 1.0);
      vTexCoord0Left = vTexCoord0 + texelSize * vec2(-1.0, 0.0);
      vTexCoord0Right = vTexCoord0 + texelSize * vec2(1.0, 0.0);
    #endif
  #endif
}
`;
