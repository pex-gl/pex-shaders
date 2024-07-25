// uBaseColor: gltf assumes sRGB color, not linear
// uBaseColorTexture: assumes sRGB color, not linear
export default /* glsl */ `
uniform vec4 uBaseColor;

#ifdef USE_BASE_COLOR_TEXTURE
  uniform sampler2D uBaseColorTexture;

  #ifdef USE_BASE_COLOR_TEXTURE_MATRIX
    uniform mat3 uBaseColorTextureMatrix;
  #endif

  void getBaseColor(inout PBRData data) {
    #ifdef USE_BASE_COLOR_TEXTURE_MATRIX
      vec2 texCoord = getTextureCoordinates(data, BASE_COLOR_TEXTURE_TEX_COORD, uBaseColorTextureMatrix);
    #else
      vec2 texCoord = getTextureCoordinates(data, BASE_COLOR_TEXTURE_TEX_COORD);
    #endif
    vec4 texelColor = texture2D(uBaseColorTexture, texCoord);

    #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
      data.baseColor = decode(uBaseColor, SRGB).rgb * decode(texelColor, SRGB).rgb;
    #endif

    #if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
      #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
        data.baseColor *= decode(vColor, SRGB).rgb;
      #endif
      data.opacity = uBaseColor.a * texelColor.a * vColor.a;
    #else
      data.opacity = uBaseColor.a * texelColor.a;
    #endif
  }
#else
  void getBaseColor(inout PBRData data) {
    #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
      data.baseColor = decode(uBaseColor, SRGB).rgb;
    #endif

    #if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
      #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
        data.baseColor *= decode(vColor, SRGB).rgb;
      #endif
      data.opacity = uBaseColor.a * vColor.a;
    #else
      data.opacity = uBaseColor.a;
    #endif
  }
#endif
`;
