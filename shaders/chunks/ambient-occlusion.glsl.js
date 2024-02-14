export default /* glsl */ `
// https://github.com/google/filament/blob/e1dfea0f121f3ee0e552fc010f0dde5ed9c7e783/shaders/src/ambient_occlusion.fs
// https://google.github.io/filament/Materials.md.html#materialdefinitions/materialblock/lighting:multibounceambientocclusion
/**
* Returns a color ambient occlusion based on a pre-computed visibility term.
* The albedo term is meant to be the diffuse color or f0 for the diffuse and
* specular terms respectively.
*/
vec3 gtaoMultiBounce(float visibility, const vec3 albedo) {
  // Jimenez et al. 2016, "Practical Realtime Strategies for Accurate Indirect Occlusion"
  vec3 a =  2.0404 * albedo - 0.3324;
  vec3 b = -4.7951 * albedo + 0.6417;
  vec3 c =  2.7552 * albedo + 0.6903;

  return max(vec3(visibility), ((visibility * a + b) * visibility + c) * visibility);
}

void multiBounceAO(float visibility, const vec3 albedo, inout vec3 color) {
  color *= gtaoMultiBounce(visibility, albedo);
}

#ifdef USE_OCCLUSION_TEXTURE
  uniform sampler2D uOcclusionTexture;

  #ifdef USE_OCCLUSION_TEXTURE_MATRIX
    uniform mat3 uOcclusionTextureMatrix;
  #endif
#endif

void getAmbientOcclusion(inout PBRData data) {
  #ifdef USE_OCCLUSION_TEXTURE
    #ifdef USE_OCCLUSION_TEXTURE_MATRIX
      vec2 texCoord = getTextureCoordinates(data, OCCLUSION_TEXTURE_TEX_COORD, uOcclusionTextureMatrix);
    #else
      vec2 texCoord = getTextureCoordinates(data, OCCLUSION_TEXTURE_TEX_COORD);
    #endif
    data.ao *= texture2D(uOcclusionTexture, texCoord).r;
  #endif
}
`;
