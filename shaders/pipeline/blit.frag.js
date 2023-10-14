import * as glslToneMap from "glsl-tone-map";

import SHADERS from "../chunks/index.js";

export default /* glsl */ `precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;

uniform float uExposure;
uniform int uOutputEncoding;

varying vec2 vTexCoord0;

// Includes
${SHADERS.math.PI}
${SHADERS.rgbm}
${SHADERS.gamma}
${SHADERS.encodeDecode}
${Object.values(glslToneMap).join("\n")}

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  vec4 color = texture2D(uTexture, vTexCoord0);

  color.rgb *= uExposure;

  #if defined(TONEMAP)
    color.rgb = TONEMAP(color.rgb);
  #endif

  gl_FragColor = encode(color, uOutputEncoding);

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}`;
