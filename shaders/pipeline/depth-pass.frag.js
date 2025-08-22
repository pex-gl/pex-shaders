import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:pipeline.depthPass.frag
 * @type {string}
 */
export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

// Variables
varying vec3 vNormalView;
varying vec2 vTexCoord0;
#ifdef USE_TEXCOORD_1
  varying vec2 vTexCoord1;
#endif
varying vec3 vPositionView;

#if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
  varying vec4 vColor;
#endif

struct PBRData {
  vec2 texCoord0;
  vec2 texCoord1;
  float opacity;
};

// Includes
${SHADERS.textureCoordinates}
${SHADERS.baseColor}
${SHADERS.alpha}
${SHADERS.depthPack}

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  PBRData data;
  data.texCoord0 = vTexCoord0;

  #ifdef USE_TEXCOORD_1
    data.texCoord1 = vTexCoord1;
  #endif

  getBaseColor(data);

  #ifdef USE_ALPHA_TEXTURE
    #ifdef ALPHA_TEXTURE_MATRIX
      vec2 alphaTexCoord = getTextureCoordinates(data, ALPHA_TEXTURE_TEX_COORD, uAlphaTextureMatrix);
    #else
      vec2 alphaTexCoord = getTextureCoordinates(data, ALPHA_TEXTURE_TEX_COORD);
    #endif
    data.opacity *= texture2D(uAlphaTexture, alphaTexCoord).r;
  #endif

  #ifdef USE_ALPHA_TEST
    alphaTest(data);
  #endif

  gl_FragColor = packDepth(length(vPositionView) / DEPTH_PACK_FAR);

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}
`;
