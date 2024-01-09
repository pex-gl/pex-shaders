import * as glslToneMap from "glsl-tone-map";

import * as SHADERS from "../chunks/index.js";

export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

uniform float uExposure;
uniform int uOutputEncoding;

uniform vec4 uBaseColor;

#if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
varying vec4 vColor;
#endif

// Includes
${SHADERS.encodeDecode}
${Object.values(glslToneMap).join("\n")}

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  vec4 color = decode(uBaseColor, SRGB);

  #if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
    color *= decode(vColor, SRGB);
  #endif

  color.rgb *= uExposure;

  #if defined(TONE_MAP)
    color.rgb = TONE_MAP(color.rgb);
  #endif

  gl_FragData[0] = encode(color, uOutputEncoding);

  #ifdef USE_DRAW_BUFFERS
    #if LOCATION_NORMAL >=0
      gl_FragData[LOCATION_NORMAL] = vec4(0.0);
    #endif
    #if LOCATION_EMISSIVE >=0
      gl_FragData[LOCATION_EMISSIVE] = vec4(0.0);
    #endif
  #endif

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}`;
