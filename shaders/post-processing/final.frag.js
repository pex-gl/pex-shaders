import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:postProcessing.postProcessing.frag
 * @type {string}
 */
export default /* glsl */ `precision highp float;

${SHADERS.output.frag}

// Variables
uniform sampler2D uTexture;
uniform vec2 uViewportSize;
uniform vec2 uTexelSize;
uniform float uTime;

// Includes
${SHADERS.math.saturate}

#if defined(USE_AA) || defined(USE_FILM_GRAIN)
  ${SHADERS.luma}
#endif

#ifdef USE_AA
  // FXAA blends anything that has high enough contrast. It helps mitigate fireflies but will blur small details.
  // - 1.00: upper limit (softer)
  // - 0.75: default amount of filtering
  // - 0.50: lower limit (sharper, less sub-pixel aliasing removal)
  // - 0.25: almost off
  // - 0.00: completely off
  uniform float uSubPixelQuality;
  ${SHADERS.encodeDecode}
  ${SHADERS.fxaa}
#endif

#ifdef USE_FILM_GRAIN
  uniform float uFilmGrainSize;
  uniform float uFilmGrainIntensity;
  uniform float uFilmGrainColorIntensity;
  uniform float uFilmGrainLuminanceIntensity;
  uniform float uFilmGrainSpeed;

  ${SHADERS.noise.common}
  ${SHADERS.noise.simplex}
  ${SHADERS.noise.perlin}
  ${SHADERS.math.random}
  ${SHADERS.filmGrain}
#endif

uniform float uOpacity;

varying vec2 vTexCoord0;

#if defined(USE_AA)
  varying vec2 vTexCoord0LeftUp;
  varying vec2 vTexCoord0RightUp;
  varying vec2 vTexCoord0LeftDown;
  varying vec2 vTexCoord0RightDown;
  varying vec2 vTexCoord0Down;
  varying vec2 vTexCoord0Up;
  varying vec2 vTexCoord0Left;
  varying vec2 vTexCoord0Right;
#endif

void main() {
  vec4 color = vec4(0.0);

  vec2 uv = vTexCoord0;

  #ifdef USE_AA
    color = fxaa(
      uTexture,
      uv,
      vTexCoord0LeftUp,
      vTexCoord0RightUp,
      vTexCoord0LeftDown,
      vTexCoord0RightDown,
      vTexCoord0Down,
      vTexCoord0Up,
      vTexCoord0Left,
      vTexCoord0Right,
      uTexelSize,
      uSubPixelQuality
    );
  #else
    color = texture2D(uTexture, uv);
  #endif

  #ifdef USE_FILM_GRAIN
    color.rgb = filmGrain(
      color.rgb,
      uv,
      uViewportSize,
      uFilmGrainSize,
      uFilmGrainIntensity,
      uFilmGrainColorIntensity,
      uFilmGrainLuminanceIntensity,
      floor(uTime * uFilmGrainSpeed * 60.0)
    );
  #endif

  gl_FragColor = color;
  gl_FragColor.a *= uOpacity;

  ${SHADERS.output.assignment}
}
`;
