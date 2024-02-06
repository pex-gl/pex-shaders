import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:pipeline.error.frag
 * @type {string}
 */
export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision mediump float;

${SHADERS.output.frag}

#define HOOK_FRAG_DECLARATIONS_END

void main () {
  gl_FragData[0] = vec4(1.0, 0.0, 0.0, 1.0);

  #ifdef USE_DRAW_BUFFERS
    #if LOCATION_NORMAL >= 0
      gl_FragData[LOCATION_NORMAL] = vec4(0.0);
    #endif
    #if LOCATION_EMISSIVE >= 0
      gl_FragData[LOCATION_EMISSIVE] = vec4(0.0);
    #endif
  #endif

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}
`;
