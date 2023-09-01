export default /* glsl */ `
#ifdef USE_ALPHA_TEXTURE
  uniform sampler2D uAlphaTexture;

  #ifdef USE_ALPHA_TEXTURE_MATRIX
    uniform mat3 uAlphaTextureMatrix;
  #endif
#endif

#ifdef USE_ALPHA_TEST
  uniform float uAlphaTest; // assumes sRGB color, not linear

  void alphaTest(inout PBRData data) {
    if (data.opacity < uAlphaTest) discard;
    // if (length(data.emissiveColor) < 0.1) discard;
    // else data.baseColor = vec3(1.0, 0.0, 0.0);
  }
#endif
`;
