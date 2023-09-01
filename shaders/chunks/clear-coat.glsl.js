export default /* glsl */ `
#ifdef USE_CLEAR_COAT
  uniform float uClearCoat;
  uniform float uClearCoatRoughness;

  #ifdef USE_CLEAR_COAT_TEXTURE
    uniform sampler2D uClearCoatTexture;

    #ifdef USE_CLEAR_COAT_TEXTURE_MATRIX
      uniform mat3 uClearCoatTextureMatrix;
    #endif

    void getClearCoat(inout PBRData data) {
      #ifdef USE_CLEAR_COAT_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, CLEAR_COAT_TEXTURE_TEX_COORD, uClearCoatTextureMatrix);
      #else
        vec2 texCoord = getTextureCoordinates(data, CLEAR_COAT_TEXTURE_TEX_COORD);
      #endif

      data.clearCoat = uClearCoat * texture2D(uClearCoatTexture, texCoord).r;
    }
  #else
    void getClearCoat(inout PBRData data) {
      data.clearCoat = uClearCoat;
    }
  #endif

  #ifdef USE_CLEAR_COAT_ROUGHNESS_TEXTURE
    uniform sampler2D uClearCoatRoughnessTexture;

    #ifdef USE_CLEAR_COAT_ROUGHNESS_TEXTURE_MATRIX
      uniform mat3 uClearCoatRoughnessTextureMatrix;
    #endif

    void getClearCoatRoughness(inout PBRData data) {
      #ifdef USE_CLEAR_COAT_ROUGHNESS_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, CLEAR_COAT_ROUGHNESS_TEXTURE_TEX_COORD, uClearCoatRoughnessTextureMatrix);
      #else
        vec2 texCoord = getTextureCoordinates(data, CLEAR_COAT_ROUGHNESS_TEXTURE_TEX_COORD);
      #endif

      data.clearCoatRoughness = uClearCoatRoughness * texture2D(uClearCoatRoughnessTexture, texCoord).g;
    }
  #else
    void getClearCoatRoughness(inout PBRData data) {
      data.clearCoatRoughness = uClearCoatRoughness;
    }
  #endif

  #ifdef USE_CLEAR_COAT_NORMAL_TEXTURE
    uniform sampler2D uClearCoatNormalTexture;
    uniform float uClearCoatNormalTextureScale;

    #ifdef USE_CLEAR_COAT_NORMAL_TEXTURE_MATRIX
      uniform mat3 uClearCoatNormalTextureMatrix;
    #endif

    void getClearCoatNormal(inout PBRData data) {
      #ifdef USE_CLEAR_COAT_NORMAL_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, CLEAR_COAT_NORMAL_TEXTURE_TEX_COORD, uClearCoatNormalTextureMatrix);
      #else
        vec2 texCoord = getTextureCoordinates(data, CLEAR_COAT_NORMAL_TEXTURE_TEX_COORD);
      #endif

      vec3 normalMap = texture2D(uClearCoatNormalTexture, texCoord).rgb * 2.0 - 1.0;
      normalMap.y *= uClearCoatNormalTextureScale;
      normalMap = normalize(normalMap);

      vec3 N = normalize(data.normalView);
      vec3 V = normalize(data.eyeDirView);

      vec3 normalView;

      #ifdef USE_TANGENTS
        vec3 bitangent = cross(N, data.tangentView.xyz) * sign(data.tangentView.w);
        mat3 TBN = mat3(data.tangentView.xyz, bitangent, N);
        normalView = normalize(TBN * normalMap);
      #else
        normalMap.xy *= float(gl_FrontFacing) * 2.0 - 1.0;
        // make the output normalView match glTF expected right handed orientation
        normalMap.y *= -1.0;
        normalView = perturb(normalMap, N, V, texCoord);
      #endif

      data.clearCoatNormal = normalize(vec3(data.inverseViewMatrix * vec4(normalView, 0.0)));
    }
  #else
    void getClearCoatNormal(inout PBRData data) {
      // geometric normal without perturbation from normalMap
      // this normal is in world space
      data.clearCoatNormal = normalize(vec3(data.inverseViewMatrix * vec4(normalize(vNormalView), 0.0)));
    }
  #endif


  // IOR = 1.5, F0 = 0.04
  // as material is no longer in contact with air we calculate new IOR on the
  // clear coat and material interface
  vec3 f0ClearCoatToSurface(const vec3 f0) {
    return saturate(f0 * (f0 * (0.941892 - 0.263008 * f0) + 0.346479) - 0.0285998);
  }

  float clearCoatBRDF(const PBRData data, const vec3 h, float NoH, float LoH, out float Fcc) {
    #if defined(USE_NORMAL_TEXTURE) || defined(USE_CLEAR_COAT_NORMAL_TEXTURE)
      float clearCoatNoH = saturate(dot(data.clearCoatNormal, h));
    #else
      float clearCoatNoH = NoH;
    #endif
    float D = D_GGX(data.clearCoatLinearRoughness, clearCoatNoH, h, data.normalWorld);
    float V = V_Kelemen(LoH);
    // air-polyurethane interface has IOR = 1.5 -> F0 = 0.04
    float F = F_Schlick(0.04, 1.0, LoH) * data.clearCoat;

    Fcc = F;
    return D * V * F;
  }
#endif
`;
