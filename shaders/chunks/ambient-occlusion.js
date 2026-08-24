/**
 * Ambient Occlusion
 *
 * Split into parts because its two consumers share only the multi-bounce
 * model: the material shader needs the texture read (and with it PBRData),
 * post-processing needs the screen-space mix.
 *
 * @type {object}
 * @name ambientOcclusion
 * @static
 */

/**
 * gtaoMultiBounce:
 * Jimenez et al. 2016, "Practical Realtime Strategies for Accurate Indirect Occlusion"
 * https://github.com/google/filament/blob/e1dfea0f121f3ee0e552fc010f0dde5ed9c7e783/shaders/src/ambient_occlusion.fs
 * https://google.github.io/filament/Materials.md.html#materialdefinitions/materialblock/lighting:multibounceambientocclusion
 * Returns a color ambient occlusion based on a pre-computed visibility term.
 * The albedo term is meant to be the diffuse color or f0 for the diffuse and
 * specular terms respectively.
 *
 * @member {string}
 */
const multiBounce = /* wgsl */ `
fn gtaoMultiBounce(visibility: f32, albedo: vec3f) -> vec3f {
  let a = 2.0404 * albedo - 0.3324;
  let b = -4.7951 * albedo + 0.6417;
  let c = 2.7552 * albedo + 0.6903;

  return max(vec3f(visibility), ((visibility * a + b) * visibility + c) * visibility);
}

fn multiBounceAO(visibility: f32, albedo: vec3f, color: ptr<function, vec3f>) {
  *color *= gtaoMultiBounce(visibility, albedo);
}
`;

/**
 * Mixes a screen-space visibility (and, with color bounce, its indirect color)
 * into an already shaded color. Requires {@link multiBounce}.
 *
 * The two approximations are independent: USE_SSAO_MULTI_BOUNCE tints the
 * occlusion analytically from visibility alone, while USE_SSAO_COLORS adds the
 * indirect color the estimator gathered from neighbouring pixels — and moves
 * visibility to `.w`, since `.xyz` then carries that color.
 *
 * Both are expected to be declared as `override` bool by the composing pipeline
 * shader.
 *
 * @member {string}
 */
const mix = /* wgsl */ `
fn ssao(colorIn: vec4f, aoData: vec4f, intensity: f32) -> vec4f {
  let visibility = select(aoData.x, aoData.w, USE_SSAO_COLORS);
  let occlusion = select(
    vec3f(visibility),
    gtaoMultiBounce(visibility, colorIn.xyz),
    USE_SSAO_MULTI_BOUNCE
  );

  var rgb = mix(colorIn.xyz, colorIn.xyz * occlusion, intensity);
  if (USE_SSAO_COLORS) {
    rgb += aoData.xyz * colorIn.xyz * 2.0;
  }

  return vec4f(rgb, colorIn.w);
}
`;

/**
 * The material's occlusion texture read.
 *
 * @member {string}
 */
const texture = /* wgsl */ `
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

export { multiBounce, mix, texture };
