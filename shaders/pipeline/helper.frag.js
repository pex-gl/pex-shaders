import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:pipeline.helper.frag
 * @type {string}
 */
export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

varying vec4 vColor;

// Includes
${SHADERS.encodeDecode}
${SHADERS.math.max3}
${SHADERS.reversibleToneMap}

#define HOOK_FRAG_DECLARATIONS_END

void main () {
  vec4 color = decode(vColor, SRGB);

  #ifdef USE_MSAA
    color.rgb = reversibleToneMap(color.rgb);
  #endif

  gl_FragData[0] = color;

  #ifdef USE_DRAW_BUFFERS
    #if LOCATION_NORMAL >= 0
      gl_FragData[LOCATION_NORMAL] = vec4(0.0, 0.0, 1.0, 1.0);
    #endif
    #if LOCATION_EMISSIVE >= 0
      gl_FragData[LOCATION_EMISSIVE] = vec4(0.0);
    #endif
  #endif

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}
`;
