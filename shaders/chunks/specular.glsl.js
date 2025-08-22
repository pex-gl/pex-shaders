// f0 and f90:
// https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_specular#implementation
// dielectricSpecularF0 = min(((ior - outside_ior) / (ior + outside_ior))^2 * specularColorFactor * specularColorTexture.rgb, float3(1.0)) * specularFactor * specularTexture.a
// dielectricSpecularF90 = specularFactor * specularTexture.a
export default /* glsl */ `
uniform float uIor;

const float OUTSIDE_IOR = 1.0; // Air

void getIor(inout PBRData data) {
  data.ior = uIor;
}

#if defined(USE_SPECULAR) && !defined(USE_SPECULAR_GLOSSINESS_WORKFLOW)
  uniform float uSpecular;
  uniform vec3 uSpecularColor;

  #ifdef USE_SPECULAR_TEXTURE
    uniform sampler2D uSpecularTexture;

    #ifdef USE_SPECULAR_TEXTURE_MATRIX
      uniform mat3 uSpecularTextureMatrix;
    #endif
  #endif

  #ifdef USE_SPECULAR_COLOR_TEXTURE
    uniform sampler2D uSpecularColorTexture;

    #ifdef USE_SPECULAR_COLOR_TEXTURE_MATRIX
      uniform mat3 uSpecularColorTextureMatrix;
    #endif
  #endif

  void getSpecular(inout PBRData data) {
    // Get specular strength and color
    float specularStrength = uSpecular;
    vec3 specularColor = uSpecularColor;

    // Factor in textures
    #ifdef USE_SPECULAR_TEXTURE
      #ifdef USE_SPECULAR_TEXTURE_MATRIX
        vec2 texCoordSpecular = getTextureCoordinates(data, SPECULAR_TEXTURE_TEX_COORD, uSpecularTextureMatrix);
      #else
        vec2 texCoordSpecular = getTextureCoordinates(data, SPECULAR_TEXTURE_TEX_COORD);
      #endif
      specularStrength *= texture2D(uSpecularTexture, texCoordSpecular).a;
    #endif

    #ifdef USE_SPECULAR_COLOR_TEXTURE
      #ifdef USE_SPECULAR_COLOR_TEXTURE_MATRIX
        vec2 texCoordSpecularColor = getTextureCoordinates(data, SPECULAR_COLOR_TEXTURE_TEX_COORD, uSpecularColorTextureMatrix);
      #else
        vec2 texCoordSpecularColor = getTextureCoordinates(data, SPECULAR_COLOR_TEXTURE_TEX_COORD);
      #endif
      specularColor *= decode(texture2D(uSpecularColorTexture, texCoordSpecularColor), SRGB).rgb;
    #endif

    data.f0 = mix(
      min(
        pow((data.ior - OUTSIDE_IOR) / (data.ior + OUTSIDE_IOR), 2.0) * specularColor,
        vec3(1.0)
      ) * specularStrength,
      data.baseColor.rgb,
      data.metallic
    );
    data.f90 = mix(vec3(specularStrength), vec3(1.0), data.metallic);
  }
#else
  void getSpecular(inout PBRData data) {
    // Compute F0 for both dielectric and metallic materials
    data.f0 = mix(
      vec3(pow((data.ior - OUTSIDE_IOR) /  (data.ior + OUTSIDE_IOR), 2.0)),
      data.baseColor.rgb,
      data.metallic
    );
    data.f90 = vec3(1.0);
  }
#endif
`;
