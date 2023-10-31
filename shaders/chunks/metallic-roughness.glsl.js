export default /* glsl */ `
#ifdef USE_METALLIC_ROUGHNESS_WORKFLOW
  uniform float uMetallic;
  uniform float uRoughness;
  uniform float uReflectance;

  // Source: Google/Filament/Overview/4.8.3.3 Roughness remapping and clamping, 07/2019
  // Minimum roughness to avoid division by zerio when 1/a^2 and to limit specular aliasing
  // This could be 0.045 when using single precision float fp32
  #define MIN_ROUGHNESS 0.089

  #ifdef USE_METALLIC_ROUGHNESS_TEXTURE
    // R = ?, G = roughness, B = metallic
    uniform sampler2D uMetallicRoughnessTexture;

    #ifdef USE_METALLIC_ROUGHNESS_TEXTURE_MATRIX
      uniform mat3 uMetallicRoughnessTextureMatrix;
    #endif

    // TODO: sampling the same texture twice
    void getMetallic(inout PBRData data) {
      #ifdef USE_METALLIC_ROUGHNESS_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, METALLIC_ROUGHNESS_TEXTURE_TEX_COORD, uMetallicRoughnessTextureMatrix);
      #else
        vec2 texCoord = getTextureCoordinates(data, METALLIC_ROUGHNESS_TEXTURE_TEX_COORD);
      #endif
      vec4 texelColor = texture2D(uMetallicRoughnessTexture, texCoord);
      data.metallic = uMetallic * texelColor.b;
      data.roughness = uRoughness * texelColor.g;
    }

    void getRoughness(inout PBRData data) {
      // NOP, already read in getMetallic
    }
  #else
    #ifdef USE_METALLIC_TEXTURE
      uniform sampler2D uMetallicTexture; //assumes linear, TODO: check gltf

      #ifdef USE_METALLIC_TEXTURE_MATRIX
        uniform mat3 uMetallicTextureMatrix;
      #endif

      void getMetallic(inout PBRData data) {
        #ifdef USE_METALLIC_TEXTURE_MATRIX
          vec2 texCoord = getTextureCoordinates(data, METALLIC_TEXTURE_TEX_COORD, uMetallicTextureMatrix);
        #else
          vec2 texCoord = getTextureCoordinates(data, METALLIC_TEXTURE_TEX_COORD);
        #endif
        data.metallic = uMetallic * texture2D(uMetallicTexture, texCoord).r;
      }
    #else
      void getMetallic(inout PBRData data) {
        data.metallic = uMetallic;
      }
    #endif

    #ifdef USE_ROUGHNESS_TEXTURE
      uniform sampler2D uRoughnessTexture; //assumes linear, TODO: check glTF

      #ifdef USE_ROUGHNESS_TEXTURE_MATRIX
        uniform mat3 uRoughnessTextureMatrix;
      #endif

      void getRoughness(inout PBRData data) {

        #ifdef USE_ROUGHNESS_TEXTURE_MATRIX
          vec2 texCoord = getTextureCoordinates(data, ROUGHNESS_TEXTURE_TEX_COORD, uRoughnessTextureMatrix);
        #else
          vec2 texCoord = getTextureCoordinates(data, ROUGHNESS_TEXTURE_TEX_COORD);
        #endif
        data.roughness = uRoughness * texture2D(uRoughnessTexture, texCoord).r + 0.01;
      }
    #else
      void getRoughness(inout PBRData data) {
        data.roughness = uRoughness + 0.01;
      }
    #endif
  #endif
#endif
`;
