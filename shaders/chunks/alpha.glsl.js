// uAlphaTest: assumes sRGB color, not linear
export default /* glsl */ `
#ifdef USE_ALPHA_TEXTURE
  uniform sampler2D uAlphaTexture;

  #ifdef USE_ALPHA_TEXTURE_MATRIX
    uniform mat3 uAlphaTextureMatrix;
  #endif
#endif

#ifdef USE_ALPHA_TEST
  uniform float uAlphaTest;

  void alphaTest(inout PBRData data) {
    if (data.opacity < uAlphaTest) discard;
  }
#endif
`;
