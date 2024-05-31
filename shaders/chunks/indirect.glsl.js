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

  // https://www.unrealengine.com/en-US/blog/physically-based-shading-on-mobile
  vec3 EnvBRDFApprox( vec3 specularColor, vec3 specularF90, float roughness, float NoV ) {
    const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022 );
    const vec4 c1 = vec4( 1.0, 0.0425, 1.04, -0.04 );
    vec4 r = roughness * c0 + c1;
    float a004 = min( r.x * r.x, exp2( -9.28 * NoV ) ) * r.x + r.y;
    vec2 AB = vec2( -1.04, 1.04 ) * a004 + r.zw;
    return specularColor * AB.x + specularF90 * AB.y;
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
    // = sheen DFG
    // // https://drive.google.com/file/d/1T0D1VSyR4AllqIJTQAraEIzjlb5h4FKH/view?usp=sharing
    float IBLSheenBRDF(float roughness, float linearRoughness, float NdotV) {
      float a = roughness < 0.25 ? -339.2 * linearRoughness + 161.4 * roughness - 25.9 : -8.48 * linearRoughness + 14.3 * roughness - 9.95;
      float b = roughness < 0.25 ? 44.0 * linearRoughness - 23.7 * roughness + 3.26 : 1.97 * linearRoughness - 3.27 * roughness + 0.72;
      float DG = exp(a * NdotV + b) + (roughness < 0.25 ? 0.0 : 0.1 * (roughness - 0.25));
      return saturate(DG * (1.0 / PI));
    }

    // https://github.com/google/filament/blob/21ea99a1d934e37d876f15bed5b025ed181bc08f/shaders/src/light_indirect.fs#L394
    void evaluateSheenIBL(inout PBRData data, float ao, inout vec3 Fd, inout vec3 Fr) {
      // Albedo scaling of the base layer before we layer sheen on top
      Fd *= data.sheenAlbedoScaling;
      Fr *= data.sheenAlbedoScaling;

      vec3 reflectance = data.sheenColor * IBLSheenBRDF(data.sheenRoughness, data.sheenLinearRoughness, data.NdotV);
      reflectance *= ao;
      Fr += reflectance * getPrefilteredReflection(data.reflectionWorld, data.sheenRoughness);
    }
  #endif

  #ifdef USE_TRANSMISSION
    // https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/6bc1df9c334288fb0d91d2febfddf97ac5dfd045/source/Renderer/shaders/ibl.glsl#L78
    vec3 getTransmissionSample(vec2 fragCoord, float roughness, float ior) {
      float framebufferLod = log2(float(uViewportSize.x)) * applyIorToRoughness(roughness, ior);
      return textureBicubic(uCaptureTexture, fragCoord.xy, framebufferLod).rgb;
    }

    vec3 getIBLVolumeRefraction(inout PBRData data, vec3 Fr) {
      #ifdef USE_DISPERSION
        // Dispersion will spread out the ior values for each r,g,b channel
        float halfSpread = (data.ior - 1.0) * 0.025 * data.dispersion;
        vec3 iors = vec3(data.ior - halfSpread, data.ior, data.ior + halfSpread);

        vec3 transmittedLight;
        float transmissionRayLength;

        for (int i = 0; i < 3; i++) {
          vec3 transmissionRay = getVolumeTransmissionRay(data.normalWorld, data.viewWorld, data.thickness, iors[i], uModelMatrix);
          // TODO: taking length of blue ray, ideally we would take the length of the green ray. For now overwriting seems ok
          transmissionRayLength = length(transmissionRay);
          vec3 refractedRayExit = data.positionWorld + transmissionRay;

          // Project refracted vector on the framebuffer, while mapping to normalized device coordinates.
          vec4 ndcPos = uProjectionMatrix * uViewMatrix * vec4(refractedRayExit, 1.0);
          vec2 refractionCoords = ndcPos.xy / ndcPos.w;
          refractionCoords += 1.0;
          refractionCoords /= 2.0;

          // Sample framebuffer to get pixel the refracted ray hits for this color channel.
          transmittedLight[i] = getTransmissionSample(refractionCoords, data.roughness, iors[i])[i];
        }
      #else
        vec3 transmissionRay = getVolumeTransmissionRay(data.normalWorld, data.viewWorld, data.thickness, data.ior, uModelMatrix);
        float transmissionRayLength = length(transmissionRay);
        vec3 refractedRayExit = data.positionWorld + transmissionRay;

        // Project refracted vector on the framebuffer, while mapping to normalized device coordinates.
        vec4 ndcPos = uProjectionMatrix * uViewMatrix * vec4(refractedRayExit, 1.0);
        vec2 refractionCoords = ndcPos.xy / ndcPos.w;
        refractionCoords += 1.0;
        refractionCoords /= 2.0;

        // Sample framebuffer to get pixel the refracted ray hits.
        vec3 transmittedLight = getTransmissionSample(refractionCoords, data.roughness, data.ior);
      #endif

      vec3 attenuatedColor = applyVolumeAttenuation(transmittedLight.rgb, transmissionRayLength, data.attenuationColor, data.attenuationDistance);

      // TODO: double check that's correct
      vec3 specularColor = Fr;

      return (1.0 - specularColor) * attenuatedColor * data.diffuseColor;
    }
  #endif

  void EvaluateLightProbe(inout PBRData data, float ao) {
    // TODO: energyCompensation
    float energyCompensation = 1.0;

    // diffuse layer
    vec3 diffuseIrradiance = getIrradiance(data.normalWorld, uReflectionMap, uReflectionMapSize, uReflectionMapEncoding);
    vec3 Fd = data.diffuseColor * diffuseIrradiance * ao;

    vec3 specularReflectance = EnvBRDFApprox(data.f0, data.f90, data.roughness, data.NdotV);
    vec3 prefilteredRadiance = getPrefilteredReflection(data.reflectionWorld, data.roughness);

    vec3 Fr = specularReflectance * prefilteredRadiance * ao;
    Fr *= energyCompensation;

    // extra ambient occlusion term for the base and subsurface layers
    multiBounceAO(ao, data.diffuseColor, Fd);
    // multiBounceSpecularAO(specularAO, data.f0, Fr);

    #ifdef USE_SHEEN
      evaluateSheenIBL(data, ao, Fd, Fr);
    #endif

    #ifdef USE_CLEAR_COAT
      evaluateClearCoatIBL(data, ao, Fd, Fr);
    #endif

    #ifdef USE_TRANSMISSION
      vec3 Ft = getIBLVolumeRefraction(data, Fr);
      Ft *= data.transmission;
      Fd *= (1.0 - data.transmission);
      data.transmitted += Ft;
    #endif

    data.indirectDiffuse += Fd;
    data.indirectSpecular += Fr;
  }
#endif
`;
