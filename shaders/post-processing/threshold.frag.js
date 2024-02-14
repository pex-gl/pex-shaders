import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:postProcessing.threshold.frag
 * @type {string}
 */
export default /* glsl */ `
precision highp float;

// Optional defines:
// COLOR_FUNCTION
// USE_SOURCE_COLOR
// USE_SOURCE_EMISSIVE

#ifndef COLOR_FUNCTION
  #define COLOR_FUNCTION luma
#endif

${SHADERS.output.frag}

#ifndef USE_SOURCE_EMISSIVE
  uniform sampler2D uTexture;
#endif
uniform sampler2D uEmissiveTexture;

uniform float uExposure;
uniform float uThreshold;

varying vec2 vTexCoord0;

// Includes
${SHADERS.luma}
${SHADERS.luminance}
${SHADERS.average}

void main() {
  // Glare naturally occurs for anything bright enough.
  #ifdef USE_SOURCE_EMISSIVE
    // For artistic control, perform threshold only on emissive.
    vec4 color = texture2D(uEmissiveTexture, vTexCoord0);
  #else
    // Or use color where, for a threshold value of 1, only HDR colors are filtered
    vec4 color = texture2D(uTexture, vTexCoord0);
  #endif

  color.rgb *= uExposure;

  float brightness = COLOR_FUNCTION(color.rgb);
  float smoothRange = 0.1;
  float t1 = uThreshold * (1.0 - smoothRange);

  if (brightness > t1) {
    color *= smoothstep(t1, uThreshold * (1.0 + smoothRange), brightness);
  } else {
    color = vec4(0.0);
  }

  // Emissive is added on top if not performing threshold on a specific source
  #if !defined(USE_SOURCE_COLOR) && !defined(USE_SOURCE_EMISSIVE)
    color += texture2D(uEmissiveTexture, vTexCoord0);
  #endif

  gl_FragColor = color;

  ${SHADERS.output.assignment}
}
`;
