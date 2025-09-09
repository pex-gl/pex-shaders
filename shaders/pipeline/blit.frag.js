import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:pipeline.blit.frag
 * @type {string}
 */
export default /* glsl */ `precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;

varying vec2 vTexCoord0;

// Includes
${SHADERS.math.max3}
${SHADERS.reversibleToneMap}
${SHADERS.encodeDecode}

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  vec4 color = texture2D(uTexture, vTexCoord0);
  color = encode(color, SRGB);

  gl_FragColor = color;

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}`;
