// https://github.com/KhronosGroup/glTF/blob/master/extensions/2.0/Khronos/KHR_materials_sheen/README.md#albedo-scaling-technique
// Needs LUT
// https://dassaultsystemes-technology.github.io/EnterprisePBRShadingModel/spec-2021x.md.html#appendix/energycompensation/sheenbrdf
// data.sheenAlbedoScaling = 1.0 - max3(data.sheenColor) * E(VdotN)

// Rather than using up a precious sampler to store the LUT of our integral, we instead fit a curve to the data, which  is piecewise  separated by a sheen  roughness of 0.25.
// The energy reduction from sheen only varies between 0.13 and 0.18 across  roughness, so we approximate  it as a constant value  of 0.157.
// https://drive.google.com/file/d/1T0D1VSyR4AllqIJTQAraEIzjlb5h4FKH/view?usp=sharing
const getSheenAlbedoScaling = /* glsl */ `
float max3(vec3 v) { return max(max(v.x, v.y), v.z); }

void getSheenAlbedoScaling(inout PBRData data) {
  data.sheenAlbedoScaling = 1.0 - 0.157 * max3(data.sheenColor);
}
`;

// uSheenColor: gltf assumes sRGB color, not linear
// uSheenColorTexture: assumes sRGB color, not linear
export default /* glsl */ `
#ifdef USE_SHEEN
  uniform vec4 uSheenColor;
  uniform float uSheenRoughness;

  #ifdef USE_SHEEN_COLOR_TEXTURE
    uniform sampler2D uSheenColorTexture;

    #ifdef USE_SHEEN_COLOR_TEXTURE_MATRIX
      uniform mat3 uSheenColorTextureMatrix;
    #endif

    void getSheenColor(inout PBRData data) {
      #ifdef USE_SHEEN_COLOR_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, SHEEN_COLOR_TEXTURE_TEX_COORD, uSheenColorTextureMatrix);
      #else
        vec2 texCoord = getTextureCoordinates(data, SHEEN_COLOR_TEXTURE_TEX_COORD);
      #endif
      vec4 texelColor = texture2D(uSheenColorTexture, texCoord);

      #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
      data.sheenColor = decode(uSheenColor, SRGB).rgb * decode(texelColor, SRGB).rgb;
      #endif

      #ifdef USE_SHEEN_ROUGHNESS_FROM_MAIN_TEXTURE
      data.sheenRoughness = uSheenRoughness * texelColor.a;
      #endif
    }
  #else
    void getSheenColor(inout PBRData data) {
      #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
      data.sheenColor = decode(uSheenColor, SRGB).rgb;
      #endif
    }
  #endif

  #ifdef USE_SHEEN_ROUGHNESS_TEXTURE
    uniform sampler2D uSheenRoughnessTexture;

    #ifdef USE_SHEEN_ROUGHNESS_TEXTURE_MATRIX
      uniform mat3 uSheenRoughnessTextureMatrix;
    #endif

    void getSheenRoughness(inout PBRData data) {
      #ifdef USE_SHEEN_ROUGHNESS_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, SHEEN_ROUGHNESS_TEXTURE_TEX_COORD, uSheenRoughnessTextureMatrix);
      #else
        vec2 texCoord = getTextureCoordinates(data, SHEEN_ROUGHNESS_TEXTURE_TEX_COORD);
      #endif

      data.sheenRoughness = uSheenRoughness * texture2D(uSheenRoughnessTexture, texCoord).a;
    }
  #else
    void getSheenRoughness(inout PBRData data) {
      #if !defined(USE_SHEEN_ROUGHNESS_FROM_MAIN_TEXTURE)
      data.sheenRoughness = uSheenRoughness;
      #endif
    }
  #endif

 ${getSheenAlbedoScaling}
#endif
`;
