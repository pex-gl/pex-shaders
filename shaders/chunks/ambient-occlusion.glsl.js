export default /* glsl */ `
#ifdef USE_AO
  uniform sampler2D uAO;
#endif

#ifdef USE_OCCLUSION_TEXTURE
  uniform sampler2D uOcclusionTexture;

  #ifdef USE_OCCLUSION_TEXTURE_MATRIX
    uniform mat3 uOcclusionTextureMatrix;
  #endif
#endif

void getOcclusion(inout PBRData data) {
  #ifdef USE_OCCLUSION_TEXTURE
    #ifdef USE_OCCLUSION_TEXTURE_MATRIX
      vec2 texCoord = getTextureCoordinates(data, OCCLUSION_TEXTURE_TEX_COORD, uOcclusionTextureMatrix);
    #else
      vec2 texCoord = getTextureCoordinates(data, OCCLUSION_TEXTURE_TEX_COORD);
    #endif
    data.ao *= texture2D(uOcclusionTexture, texCoord).r;
  #endif

  #ifdef USE_AO
    vec2 aoTexCoord = gl_FragCoord.xy / uViewportSize;
    data.ao *= texture2D(uAO, aoTexCoord).r;
  #endif
}
`;
