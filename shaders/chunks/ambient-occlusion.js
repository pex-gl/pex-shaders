// gtaoMultiBounce:
// Jimenez et al. 2016, "Practical Realtime Strategies for Accurate Indirect Occlusion"
// https://github.com/google/filament/blob/e1dfea0f121f3ee0e552fc010f0dde5ed9c7e783/shaders/src/ambient_occlusion.fs
// https://google.github.io/filament/Materials.md.html#materialdefinitions/materialblock/lighting:multibounceambientocclusion
// Returns a color ambient occlusion based on a pre-computed visibility term.
// The albedo term is meant to be the diffuse color or f0 for the diffuse and
// specular terms respectively.
export default /* wgsl */ `
fn gtaoMultiBounce(visibility: f32, albedo: vec3f) -> vec3f {
  let a = 2.0404 * albedo - 0.3324;
  let b = -4.7951 * albedo + 0.6417;
  let c = 2.7552 * albedo + 0.6903;

  return max(vec3f(visibility), ((visibility * a + b) * visibility + c) * visibility);
}

fn multiBounceAO(visibility: f32, albedo: vec3f, color: ptr<function, vec3f>) {
  *color *= gtaoMultiBounce(visibility, albedo);
}

// USE_SSAO_COLORS is expected to be declared as \`override\` bool by the
// composing pipeline shader.
fn ssao(colorIn: vec4f, aoData: vec4f, intensity: f32) -> vec4f {
  var color = colorIn;
  if (USE_SSAO_COLORS) {
    let rgb = mix(color.xyz, color.xyz * gtaoMultiBounce(aoData.w, color.xyz), intensity);
    color = vec4f(rgb + aoData.xyz * color.xyz * 2.0, color.w);
  } else {
    color = vec4f(color.xyz * mix(vec3f(1.0), vec3f(aoData.x), intensity), color.w);
  }

  return color;
}

fn getAmbientOcclusion(
  data: ptr<function, PBRData>,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.ao *= textureSample(tex, texSampler, texCoord).x;
}
`;
