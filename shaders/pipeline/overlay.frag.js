import * as SHADERS from "../chunks/index.js";

/**
 * @type {string}
 * @alias module:pipeline.overlay.frag
 */
export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

varying vec2 vTexCoord0;
uniform sampler2D uTexture;

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  gl_FragColor = texture2D(uTexture, vTexCoord0);

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}
`;
