export default /* glsl */ `
#ifdef USE_TRANSMISSION
  uniform sampler2D uCaptureTexture;
#endif

#ifdef USE_TRANSMISSION
  uniform float uTransmission;
  uniform mat4 uProjectionMatrix;

  #ifdef USE_DISPERSION
    uniform float uDispersion;
  #endif

  #ifdef USE_TRANSMISSION_TEXTURE
    uniform sampler2D uTransmissionTexture;

    #ifdef USE_TRANSMISSION_TEXTURE_MATRIX
      uniform mat3 uTransmissionTextureMatrix;
    #endif

    void getTransmission(inout PBRData data) {
      #ifdef USE_TRANSMISSION_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, TRANSMISSION_TEXTURE_TEX_COORD, uTransmissionTextureMatrix);
      #else
        vec2 texCoord = getTextureCoordinates(data, TRANSMISSION_TEXTURE_TEX_COORD);
      #endif

      data.transmission = uTransmission * texture2D(uTransmissionTexture, texCoord).r;
    }
  #else
    void getTransmission(inout PBRData data) {
      data.transmission = uTransmission;
    }
  #endif

  float applyIorToRoughness(float roughness, float ior) {
    // Scale roughness with IOR so that an IOR of 1.0 results in no microfacet refraction and
    // an IOR of 1.5 results in the default amount of microfacet refraction.
    return roughness * saturate(ior * 2.0 - 2.0);
  }

  vec3 getVolumeTransmissionRay(vec3 n, vec3 v, float thickness, float ior, mat4 modelMatrix) {
    // Direction of refracted light.
    vec3 refractionVector = refract(-v, normalize(n), 1.0 / ior);

    // Compute rotation-independant scaling of the model matrix.
    vec3 modelScale;
    modelScale.x = length(vec3(modelMatrix[0].xyz));
    modelScale.y = length(vec3(modelMatrix[1].xyz));
    modelScale.z = length(vec3(modelMatrix[2].xyz));

    // The thickness is specified in local space.
    return normalize(refractionVector) * thickness * modelScale;
  }
#endif

#if defined(USE_TRANSMISSION) || defined(USE_VOLUME)
  // Compute attenuated light as it travels through a volume.
  vec3 applyVolumeAttenuation(vec3 radiance, float transmissionDistance, vec3 attenuationColor, float attenuationDistance) {
    if (isinf(attenuationDistance) || attenuationDistance == 0.0) {
      // Attenuation distance is +∞ (which we indicate by zero or infinity), i.e. the transmitted color is not attenuated at all.
      return radiance;
    } else {
      // Compute light attenuation using Beer's law.
      vec3 transmittance = pow(attenuationColor, vec3(transmissionDistance / attenuationDistance));
      return transmittance * radiance;
    }
  }
#endif

#ifdef USE_VOLUME
  uniform float uThickness;
  uniform float uAttenuationDistance;
  uniform vec3 uAttenuationColor;

  #ifdef USE_THICKNESS_TEXTURE
    uniform sampler2D uThicknessTexture;

    #ifdef USE_THICKNESS_TEXTURE_MATRIX
      uniform mat3 uThicknessTextureMatrix;
    #endif

    void getThickness(inout PBRData data) {
      #ifdef USE_THICKNESS_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, THICKNESS_TEXTURE_TEX_COORD, uThicknessTextureMatrix);
      #else
        vec2 texCoord = getTextureCoordinates(data, THICKNESS_TEXTURE_TEX_COORD);
      #endif

      data.thickness = uThickness * texture2D(uThicknessTexture, texCoord).g;
    }
  #else
    void getThickness(inout PBRData data) {
      data.thickness = uThickness;
    }
  #endif

  void getAttenuation(inout PBRData data) {
    data.attenuationColor = uAttenuationColor;
    data.attenuationDistance = uAttenuationDistance;
  }
#endif

#ifdef USE_DIFFUSE_TRANSMISSION
  uniform float uDiffuseTransmission;
  uniform vec3 uDiffuseTransmissionColor;

  #ifdef USE_DIFFUSE_TRANSMISSION_TEXTURE
    uniform sampler2D uDiffuseTransmissionTexture;

    #ifdef USE_DIFFUSE_TRANSMISSION_TEXTURE_MATRIX
      uniform mat3 uDiffuseTransmissionTextureMatrix;
    #endif
  #endif

  #ifdef USE_DIFFUSE_TRANSMISSION_COLOR_TEXTURE
    uniform sampler2D uDiffuseTransmissionColorTexture;

    #ifdef USE_DIFFUSE_TRANSMISSION_COLOR_TEXTURE_MATRIX
      uniform mat3 uDiffuseTransmissionColorTextureMatrix;
    #endif
  #endif

  void getDiffuseTransmission(inout PBRData data) {
    // Get diffuse transmission strength and color
    float diffuseTransmissionStrength = uDiffuseTransmission;
    vec3 diffuseTransmissionColor = uDiffuseTransmissionColor;

    // Factor in textures
    #ifdef USE_DIFFUSE_TRANSMISSION_TEXTURE
      #ifdef USE_DIFFUSE_TRANSMISSION_TEXTURE_MATRIX
        vec2 texCoordDiffuseTransmission = getTextureCoordinates(data, DIFFUSE_TRANSMISSION_TEXTURE_TEX_COORD, uDiffuseTransmissionTextureMatrix);
      #else
        vec2 texCoordDiffuseTransmission = getTextureCoordinates(data, DIFFUSE_TRANSMISSION_TEXTURE_TEX_COORD);
      #endif
      diffuseTransmissionStrength *= texture2D(uDiffuseTransmissionTexture, texCoordDiffuseTransmission).a;
    #endif

    #ifdef USE_DIFFUSE_TRANSMISSION_COLOR_TEXTURE
      #ifdef USE_DIFFUSE_TRANSMISSION_COLOR_TEXTURE_MATRIX
        vec2 texCoordDiffuseTransmissionColor = getTextureCoordinates(data, DIFFUSE_TRANSMISSION_COLOR_TEXTURE_TEX_COORD, uDiffuseTransmissionColorTextureMatrix);
      #else
        vec2 texCoordDiffuseTransmissionColor = getTextureCoordinates(data, DIFFUSE_TRANSMISSION_COLOR_TEXTURE_TEX_COORD);
      #endif
      diffuseTransmissionColor *= decode(texture2D(uDiffuseTransmissionColorTexture, texCoordDiffuseTransmissionColor), SRGB).rgb;
    #endif

    data.diffuseTransmission = diffuseTransmissionStrength;
    data.diffuseTransmissionColor = diffuseTransmissionColor;

    #ifdef USE_VOLUME
      data.diffuseTransmissionThickness = data.thickness * (length(vec3(uModelMatrix[0].xyz)) + length(vec3(uModelMatrix[1].xyz)) + length(vec3(uModelMatrix[2].xyz))) / 3.0;
    #else
      data.diffuseTransmissionThickness = 1.0;
    #endif
  }
#endif

#ifdef USE_TRANSMISSION
  // "Mipped Bicubic Texture Filtering" (https://www.shadertoy.com/view/4df3Dn)
  const float ONE_OVER_SIX = 1.0 / 6.0;
  float textureBicubicW0(float a) {
    return ONE_OVER_SIX * (a * (a * (-a + 3.0) - 3.0) + 1.0);
  }

  float textureBicubicW1(float a) {
    return ONE_OVER_SIX * (a * a * (3.0 * a - 6.0) + 4.0);
  }

  float textureBicubicW2(float a) {
    return ONE_OVER_SIX * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0);
  }

  float textureBicubicW3(float a) {
    return ONE_OVER_SIX * (a * a * a);
  }

  // g0 and g1 are the two amplitude functions
  float textureBicubicG0(float a) {
    return textureBicubicW0(a) + textureBicubicW1(a);
  }

  float textureBicubicG1(float a) {
    return textureBicubicW2(a) + textureBicubicW3(a);
  }

  // h0 and h1 are the two offset functions
  float textureBicubicH0(float a) {
    return -1.0 + textureBicubicW1(a) / (textureBicubicW0(a) + textureBicubicW1(a));
  }

  float textureBicubicH1(float a) {
    return 1.0 + textureBicubicW3(a) / (textureBicubicW2(a) + textureBicubicW3(a));
  }

  vec4 textureBicubicSample(sampler2D tex, vec2 uv, vec4 texelSize, float lod) {
    uv = uv * texelSize.zw + 0.5;

    vec2 iuv = floor(uv);
    vec2 fuv = fract(uv);

    float g0x = textureBicubicG0(fuv.x);
    float g1x = textureBicubicG1(fuv.x);
    float h0x = textureBicubicH0(fuv.x);
    float h1x = textureBicubicH1(fuv.x);
    float h0y = textureBicubicH0(fuv.y);
    float h1y = textureBicubicH1(fuv.y);

    vec2 p0 = (vec2(iuv.x + h0x, iuv.y + h0y) - 0.5) * texelSize.xy;
    vec2 p1 = (vec2(iuv.x + h1x, iuv.y + h0y) - 0.5) * texelSize.xy;
    vec2 p2 = (vec2(iuv.x + h0x, iuv.y + h1y) - 0.5) * texelSize.xy;
    vec2 p3 = (vec2(iuv.x + h1x, iuv.y + h1y) - 0.5) * texelSize.xy;

    return (
      textureBicubicG0(fuv.y) *
        (g0x * textureLod(tex, p0, lod) + g1x * textureLod(tex, p1, lod)) +
      textureBicubicG1(fuv.y) *
        (g0x * textureLod(tex, p2, lod) + g1x * textureLod(tex, p3, lod))
    );
  }

  vec4 textureBicubic(sampler2D s, vec2 uv, float lod) {
    vec2 lodSizeFloor = vec2(textureSize(s, int(lod)));
    vec2 lodSizeCeil = vec2(textureSize(s, int(lod + 1.0)));

    vec2 lodSizeFloorInv = 1.0 / lodSizeFloor;
    vec2 lodSizeCeilInv = 1.0 / lodSizeCeil;

    vec4 floorSample = textureBicubicSample(s, uv, vec4(lodSizeFloorInv, lodSizeFloor), floor(lod));
    vec4 ceilSample = textureBicubicSample(s, uv, vec4(lodSizeCeilInv, lodSizeCeil), ceil(lod));

    return mix(floorSample, ceilSample, fract(lod));
  }
#endif
`;
