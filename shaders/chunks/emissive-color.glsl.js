// uEmissiveColor: gltf assumes sRGB color, not linear
// uEmissiveColorTexture: assumes sRGB color, not linear
export default /* glsl */ `
#ifdef USE_EMISSIVE_COLOR
  uniform vec4 uEmissiveColor;
  uniform float uEmissiveIntensity;
#endif

#ifdef USE_EMISSIVE_COLOR_TEXTURE
  uniform sampler2D uEmissiveColorTexture;

  #ifdef USE_EMISSIVE_COLOR_TEXTURE_MATRIX
    uniform mat3 uEmissiveColorTextureMatrix;
  #endif

  void getEmissiveColor(inout PBRData data) {
    #ifdef USE_EMISSIVE_COLOR_TEXTURE_MATRIX
      vec2 texCoord = getTextureCoordinates(data, EMISSIVE_COLOR_TEXTURE_TEX_COORD, uEmissiveColorTextureMatrix);
    #else
      vec2 texCoord = getTextureCoordinates(data, EMISSIVE_COLOR_TEXTURE_TEX_COORD);
    #endif

    data.emissiveColor = texture2D(uEmissiveColorTexture, texCoord).rgb;

    #ifdef USE_EMISSIVE_COLOR
      data.emissiveColor *= uEmissiveIntensity * decode(uEmissiveColor, SRGB).rgb;
    #endif

    #if defined(USE_INSTANCED_COLOR)
      #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
        data.emissiveColor *= decode(vColor, SRGB).rgb;
      #endif
    #endif
  }
#elif defined(USE_EMISSIVE_COLOR)
  void getEmissiveColor(inout PBRData data) {
    data.emissiveColor = uEmissiveIntensity * decode(uEmissiveColor, SRGB).rgb;
    #if defined(USE_INSTANCED_COLOR)
      #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
        data.emissiveColor *= decode(vColor, SRGB).rgb;
      #endif
    #endif
  }
#else
  void getEmissiveColor(inout PBRData data) {
    data.emissiveColor = vec3(0.0);
  }
#endif
`;
