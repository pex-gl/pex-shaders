/**
 * Ambient Occlusion
 *
 * Split into parts because its two consumers share only the multi-bounce model:
 * the material shader needs the texture read (and with it PBRData),
 * post-processing needs the screen-space mix.
 *
 * @type {object}
 * @name ambientOcclusion
 * @static
 */

/**
 * GtaoMultiBounce: Jimenez et al. 2016, "Practical Realtime Strategies for
 * Accurate Indirect Occlusion"
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
 * Specular occlusion derived from the diffuse visibility term, after Lagarde
 * and de Rousiers 2014, "Moving Frostbite to PBR".
 *
 * Reusing the diffuse visibility for the specular lobe over-occludes a smooth
 * surface, whose lobe is narrow enough to miss the occluder entirely.
 *
 * Smoothness in `visibility` matters more here than accuracy. The
 * cone-intersection alternative (Jimenez et al. 2016 §4.4, using a bent normal)
 * is sharper in principle, but its aperture goes as `sqrt(1 - visibility)`,
 * whose derivative is unbounded at full visibility, and for a smooth material
 * its specular cone is a fraction of a degree wide — so it degenerates into a
 * step function positioned by the AO term. Fed a screen-space AO buffer sitting
 * near 1, per-pixel noise far below the visible threshold lands on both sides
 * of that step and reads as binary speckle on grazing surfaces. This one is
 * monotone and branchless, and needs no bent normal.
 *
 * Requires {@link multiBounce} for the coloured variant.
 *
 * @member {string}
 */
const specular = /* wgsl */ `
fn specularAO(NdotV: f32, visibility: f32, linearRoughness: f32) -> f32 {
  return saturateF32(
    pow(NdotV + visibility, exp2(-16.0 * linearRoughness - 1.0)) - 1.0 + visibility
  );
}

fn multiBounceSpecularAO(visibility: f32, f0: vec3f, color: ptr<function, vec3f>) {
  *color *= gtaoMultiBounce(visibility, f0);
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
  strength: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.ao *= 1.0 + strength * (textureSample(tex, texSampler, texCoord).x - 1.0);
}
`;

export { multiBounce, specular, texture };
