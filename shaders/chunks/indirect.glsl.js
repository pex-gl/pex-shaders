export default /* glsl */ `
#ifdef USE_REFLECTION_PROBES
  uniform sampler2D uReflectionMap;
  uniform float uReflectionMapSize;
  uniform int uReflectionMapEncoding;

  #define MAX_MIPMAP_LEVEL 5.0

  vec3 getPrefilteredReflection(vec3 reflected, float roughness) {
    float lod = pow(roughness, 2.0) * MAX_MIPMAP_LEVEL; // TODO: verify reflection probe blurring code
    // float lod = pow(roughness, 1.5) * MAX_MIPMAP_LEVEL;
    float upLod = floor(lod);
    float downLod = ceil(lod);

    vec3 a = decode(texture2D(uReflectionMap, envMapOctahedral(reflected, 0.0, upLod, uReflectionMapSize)), uReflectionMapEncoding).rgb;
    vec3 b = decode(texture2D(uReflectionMap, envMapOctahedral(reflected, 0.0, downLod, uReflectionMapSize)), uReflectionMapEncoding).rgb;

    return mix(a, b, lod - upLod);
  }

  vec3 EnvBRDFApprox( vec3 specularColor, float roughness, float NoV ) {
    const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022 );
    const vec4 c1 = vec4( 1.0, 0.0425, 1.04, -0.04 );
    vec4 r = roughness * c0 + c1;
    float a004 = min( r.x * r.x, exp2( -9.28 * NoV ) ) * r.x + r.y;
    vec2 AB = vec2( -1.04, 1.04 ) * a004 + r.zw;
    return specularColor * AB.x + AB.y;
  }

  #ifdef USE_CLEAR_COAT
    // https://google.github.io/filament/Filament.md.html#lighting/imagebasedlights/clearcoat
    void evaluateClearCoatIBL(const PBRData data, float ao, inout vec3 Fd, inout vec3 Fr) {
      #if defined(USE_NORMAL_TEXTURE) || defined(USE_CLEAR_COAT_NORMAL_TEXTURE)
        float clearCoatNoV = abs(dot(data.clearCoatNormal, data.viewWorld)) + FLT_EPS;
        vec3 clearCoatR = reflect(-data.viewWorld, data.clearCoatNormal);
      #else
        float clearCoatNoV = data.NdotV;
        vec3 clearCoatR = data.reflectionWorld;
      #endif
      // The clear coat layer assumes an IOR of 1.5 (4% reflectance)
      float Fc = F_Schlick(0.04, 1.0, clearCoatNoV) * data.clearCoat;
      float attenuation = 1.0 - Fc;
      // https://github.com/google/filament/commit/6a8e6d45b5c57280898ad064426bc197978e71c5
      // Fr *= (attenuation * attenuation);
      Fr *= attenuation;
      Fr += getPrefilteredReflection(clearCoatR, data.clearCoatRoughness) * (ao * Fc);
      Fd *= attenuation;
    }
  #endif

  #ifdef USE_SHEEN
    // https://github.com/google/filament/blob/21ea99a1d934e37d876f15bed5b025ed181bc08f/shaders/src/light_indirect.fs#L394
    void evaluateSheenIBL(inout PBRData data, float ao, inout vec3 Fd, inout vec3 Fr) {
      // Albedo scaling of the base layer before we layer sheen on top
      // Fd *= data.sheenAlbedoScaling;
      // Fr *= data.sheenAlbedoScaling;

      vec3 reflectance = EnvBRDFApprox(data.sheenColor, data.sheenRoughness, data.NdotV);
      reflectance *= ao;

      vec3 radiance = getPrefilteredReflection(data.reflectionWorld, data.sheenRoughness);
      // Fr += reflectance * radiance;

      // // vec3 Fs = radiance + reflectance * ao;
      // vec3 Fs = vec3(0.0);
      // data.sheen += Fs;
    }
  #endif

  void EvaluateLightProbe(inout PBRData data, float ao) {
    // TODO: energyCompensation
    float energyCompensation = 1.0;

    // diffuse layer
    vec3 diffuseIrradiance = getIrradiance(data.normalWorld, uReflectionMap, uReflectionMapSize, uReflectionMapEncoding);
    vec3 Fd = data.diffuseColor * diffuseIrradiance * ao;

    vec3 specularReflectance = EnvBRDFApprox(data.f0, data.roughness, data.NdotV);
    vec3 prefilteredRadiance = getPrefilteredReflection(data.reflectionWorld, data.roughness);

    vec3 Fr = specularReflectance * prefilteredRadiance * ao;
    Fr *= energyCompensation;


    // #ifdef USE_SHEEN
    //   evaluateSheenIBL(data, ao, Fd, Fr);
    // #endif

    #ifdef USE_CLEAR_COAT
      evaluateClearCoatIBL(data, ao, Fd, Fr);
    #endif

    data.indirectDiffuse += Fd;
    data.indirectSpecular += Fr;
  }
#endif
`;
