export default /* glsl */ `
#ifdef USE_AO
  uniform sampler2D uAO;
  uniform vec2 uScreenSize;
#endif

#ifdef USE_OCCLUSION_TEXTURE
  uniform sampler2D uOcclusionTexture;

  #ifdef USE_OCCLUSION_TEXTURE_MATRIX
    uniform mat3 uOcclusionTextureMatrix;
  #endif
#endif
`;
