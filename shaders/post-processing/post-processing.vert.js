import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:postProcessing.postProcessing.vert
 * @type {string}
 */
export default /* glsl */ `
${SHADERS.output.vert}

attribute vec2 aPosition;

uniform vec2 uViewportSize;

varying vec2 vTexCoord0;

#if defined(USE_AA) || defined(USE_UPSAMPLE) || defined(USE_DOWN_SAMPLE)
  uniform vec2 uTexelSize;

  #if defined(USE_FXAA_2) || defined(USE_FXAA_3) || defined(USE_UPSAMPLE) || defined(USE_DOWN_SAMPLE)
    varying vec2 vTexCoord0LeftUp;
    varying vec2 vTexCoord0RightUp;
    varying vec2 vTexCoord0LeftDown;
    varying vec2 vTexCoord0RightDown;
  #endif
  #if defined(USE_FXAA_3) || defined(USE_UPSAMPLE)
    varying vec2 vTexCoord0Down;
    varying vec2 vTexCoord0Up;
    varying vec2 vTexCoord0Left;
    varying vec2 vTexCoord0Right;
  #endif
#endif

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vTexCoord0 = aPosition * 0.5 + 0.5;

  #if defined(USE_AA) || defined(USE_UPSAMPLE) || defined(USE_DOWN_SAMPLE)
    #if defined(USE_FXAA_2) || defined(USE_FXAA_3) || defined(USE_UPSAMPLE) || defined(USE_DOWN_SAMPLE)
      #if defined(USE_UPSAMPLE) && defined(QUALITY) && QUALITY == 0
      float offset = 0.5;
      #else
      float offset = 1.0;
      #endif

      vTexCoord0LeftUp = vTexCoord0 + uTexelSize * offset * vec2(-1.0, 1.0);
      vTexCoord0RightUp = vTexCoord0 + uTexelSize * offset * vec2(1.0, 1.0);
      vTexCoord0LeftDown = vTexCoord0 + uTexelSize * offset * vec2(-1.0, -1.0);
      vTexCoord0RightDown = vTexCoord0 + uTexelSize * offset * vec2(1.0, -1.0);
    #endif

    #if defined(USE_FXAA_3) || defined(USE_UPSAMPLE)
      vTexCoord0Down = vTexCoord0 + uTexelSize * vec2(0.0, -1.0);
      vTexCoord0Up = vTexCoord0 + uTexelSize * vec2(0.0, 1.0);
      vTexCoord0Left = vTexCoord0 + uTexelSize * vec2(-1.0, 0.0);
      vTexCoord0Right = vTexCoord0 + uTexelSize * vec2(1.0, 0.0);
    #endif
  #endif
}
`;
