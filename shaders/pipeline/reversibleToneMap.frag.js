import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:pipeline.reversibleToneMap.frag
 * @type {string}
 */
export default /* glsl */ `precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;

varying vec2 vTexCoord0;

// Includes
${SHADERS.math.max3}
${SHADERS.reversibleToneMap}

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  vec4 color = texture2D(uTexture, vTexCoord0);
  color.rgb = reversibleToneMapInverse(color.rgb);

  gl_FragColor = color;

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}`;
