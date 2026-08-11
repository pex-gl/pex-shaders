export default /* wgsl */ `
// USE_REFLECTION_PROBES, USE_CLEAR_COAT, USE_NORMAL_TEXTURE, USE_CLEAR_COAT_NORMAL_TEXTURE,
// USE_SHEEN, USE_TRANSMISSION, USE_DISPERSION, USE_DIFFUSE_TRANSMISSION and USE_VOLUME
// are expected to be declared as \`override\` bool by the composing pipeline shader.

// Prefiltered specular radiance from the native cubemap. Perceptual roughness
// maps linearly to lod because each mip was prefiltered at roughness =
// mip / (numMipLevels - 1); trilinear filtering interpolates between levels.
fn getPrefilteredReflection(
  reflected: vec3f,
  roughness: f32,
  prefilteredMap: texture_cube<f32>,
  prefilteredMapSampler: sampler,
  numMipLevels: f32
) -> vec3f {
  let lod = roughness * (numMipLevels - 1.0);
  return textureSampleLevel(prefilteredMap, prefilteredMapSampler, reflected, lod).rgb;
}

// Diffuse irradiance reconstructed from L2 SH. The coefficients already fold in
// the cosine-lobe convolution and 1/π (see shaders/reflection-probe.ts), so this
// returns diffuse radiance directly. Basis/index order must match the projection.
fn shIrradiance(sh: array<vec4f, 9>, n: vec3f) -> vec3f {
  let b = array<f32, 9>(
    0.282095,
    0.488603 * n.y,
    0.488603 * n.z,
    0.488603 * n.x,
    1.092548 * n.x * n.y,
    1.092548 * n.y * n.z,
    0.315392 * (3.0 * n.z * n.z - 1.0),
    1.092548 * n.x * n.z,
    0.546274 * (n.x * n.x - n.y * n.y)
  );
  var result = vec3f(0.0);
  for (var k = 0; k < 9; k++) { result += sh[k].rgb * b[k]; }
  return max(result, vec3f(0.0));
}

// Analytic environment BRDF (DFG) fit, returning the split-sum scale/bias so
// the caller can reuse it for both the single- and multiple-scattering terms.
// https://www.unrealengine.com/en-US/blog/physically-based-shading-on-mobile
fn EnvBRDFApproxAB(roughness: f32, NoV: f32) -> vec2f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022);
  let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let r = roughness * c0 + c1;
  let a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  return vec2f(-1.04, 1.04) * a004 + r.zw;
}

// https://google.github.io/filament/Filament.md.html#lighting/imagebasedlights/clearcoat
fn evaluateClearCoatIBL(
  data: PBRData,
  ao: f32,
  Fd: ptr<function, vec3f>,
  Fr: ptr<function, vec3f>,
  prefilteredMap: texture_cube<f32>,
  prefilteredMapSampler: sampler,
  numMipLevels: f32
) {
  var clearCoatNoV = data.NdotV;
  var clearCoatR = data.reflectionWorld;
  if (USE_NORMAL_TEXTURE || USE_CLEAR_COAT_NORMAL_TEXTURE) {
    clearCoatNoV = abs(dot(data.clearCoatNormal, data.viewWorld)) + FLT_EPS;
    clearCoatR = reflect(-data.viewWorld, data.clearCoatNormal);
  }
  // The clear coat layer assumes an IOR of 1.5 (4% reflectance)
  let Fc = F_SchlickClearCoat(clearCoatNoV) * data.clearCoat;
  let attenuation = 1.0 - Fc;
  // https://github.com/google/filament/commit/6a8e6d45b5c57280898ad064426bc197978e71c5
  // *Fr *= (attenuation * attenuation);
  *Fr *= attenuation;
  *Fr += getPrefilteredReflection(clearCoatR, data.clearCoatRoughness, prefilteredMap, prefilteredMapSampler, numMipLevels) * (ao * Fc);
  *Fd *= attenuation;
}

// = sheen DFG
// https://drive.google.com/file/d/1T0D1VSyR4AllqIJTQAraEIzjlb5h4FKH/view?usp=sharing
fn IBLSheenBRDF(roughness: f32, linearRoughness: f32, NdotV: f32) -> f32 {
  let a = select(-8.48 * linearRoughness + 14.3 * roughness - 9.95, -339.2 * linearRoughness + 161.4 * roughness - 25.9, roughness < 0.25);
  let b = select(1.97 * linearRoughness - 3.27 * roughness + 0.72, 44.0 * linearRoughness - 23.7 * roughness + 3.26, roughness < 0.25);
  let DG = exp(a * NdotV + b) + select(0.1 * (roughness - 0.25), 0.0, roughness < 0.25);
  return saturateF32(DG * (1.0 / PI));
}

// https://github.com/google/filament/blob/21ea99a1d934e37d876f15bed5b025ed181bc08f/shaders/src/light_indirect.fs#L394
fn evaluateSheenIBL(
  data: ptr<function, PBRData>,
  ao: f32,
  Fd: ptr<function, vec3f>,
  Fr: ptr<function, vec3f>,
  prefilteredMap: texture_cube<f32>,
  prefilteredMapSampler: sampler,
  numMipLevels: f32
) {
  // Albedo scaling of the base layer before we layer sheen on top
  *Fd *= data.sheenAlbedoScaling;
  *Fr *= data.sheenAlbedoScaling;

  var reflectance = data.sheenColor * IBLSheenBRDF(data.sheenRoughness, data.sheenLinearRoughness, data.NdotV);
  reflectance *= ao;
  *Fr += reflectance * getPrefilteredReflection(data.reflectionWorld, data.sheenRoughness, prefilteredMap, prefilteredMapSampler, numMipLevels);
}

// https://github.com/KhronosGroup/glTF-Sample-Viewer/blob/6bc1df9c334288fb0d91d2febfddf97ac5dfd045/source/Renderer/shaders/ibl.glsl#L78
fn getTransmissionSample(
  fragCoord: vec2f,
  roughness: f32,
  ior: f32,
  captureTexture: texture_2d<f32>,
  captureTextureSampler: sampler,
  viewportSize: vec2f
) -> vec3f {
  let framebufferLod = log2(viewportSize.x) * applyIorToRoughness(roughness, ior);
  return textureBicubic(captureTexture, captureTextureSampler, fragCoord.xy, framebufferLod).xyz;
}

fn getIBLVolumeRefraction(
  data: ptr<function, PBRData>,
  Fr: vec3f,
  captureTexture: texture_2d<f32>,
  captureTextureSampler: sampler,
  viewportSize: vec2f,
  modelMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f
) -> vec3f {
  var transmittedLight: vec3f;
  var transmissionRayLength: f32;

  if (USE_DISPERSION) {
    // Dispersion will spread out the ior values for each r,g,b channel
    let halfSpread = (data.ior - 1.0) * 0.025 * data.dispersion;
    let iors = vec3f(data.ior - halfSpread, data.ior, data.ior + halfSpread);

    for (var i = 0; i < 3; i++) {
      let transmissionRay = getVolumeTransmissionRay(data.normalWorld, data.viewWorld, data.thickness, iors[i], modelMatrix);
      // TODO: taking length of blue ray, ideally we would take the length of the green ray. For now overwriting seems ok
      transmissionRayLength = length(transmissionRay);
      let refractedRayExit = data.positionWorld + transmissionRay;

      // Project refracted vector on the framebuffer, while mapping to normalized device coordinates.
      let ndcPos = projectionMatrix * viewMatrix * vec4f(refractedRayExit, 1.0);
      var refractionCoords = ndcPos.xy / ndcPos.w;
      refractionCoords += 1.0;
      refractionCoords /= 2.0;

      // Sample framebuffer to get pixel the refracted ray hits for this color channel.
      transmittedLight[i] = getTransmissionSample(refractionCoords, data.roughness, iors[i], captureTexture, captureTextureSampler, viewportSize)[i];
    }
  } else {
    let transmissionRay = getVolumeTransmissionRay(data.normalWorld, data.viewWorld, data.thickness, data.ior, modelMatrix);
    transmissionRayLength = length(transmissionRay);
    let refractedRayExit = data.positionWorld + transmissionRay;

    // Project refracted vector on the framebuffer, while mapping to normalized device coordinates.
    let ndcPos = projectionMatrix * viewMatrix * vec4f(refractedRayExit, 1.0);
    var refractionCoords = ndcPos.xy / ndcPos.w;
    refractionCoords += 1.0;
    refractionCoords /= 2.0;

    // Sample framebuffer to get pixel the refracted ray hits.
    transmittedLight = getTransmissionSample(refractionCoords, data.roughness, data.ior, captureTexture, captureTextureSampler, viewportSize);
  }

  let attenuatedColor = applyVolumeAttenuation(transmittedLight.xyz, transmissionRayLength, data.attenuationColor, data.attenuationDistance);

  // TODO: double check that's correct
  let specularColor = Fr;

  return (1.0 - specularColor) * attenuatedColor * data.diffuseColor;
}

fn EvaluateLightProbe(
  data: ptr<function, PBRData>,
  ao: f32,
  prefilteredMap: texture_cube<f32>,
  prefilteredMapSampler: sampler,
  numMipLevels: f32,
  sh: array<vec4f, 9>,
  captureTexture: texture_2d<f32>,
  captureTextureSampler: sampler,
  viewportSize: vec2f,
  modelMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f
) {
  // Multiple-scattering microfacet IBL (Fdez-Agüera 2019). The single- and
  // multiple-scattering terms are derived from the same DFG (f_ab) evaluation,
  // so rough surfaces recover the energy a single-scatter split-sum would lose.
  // https://www.jcgt.org/published/0008/01/03/paper.pdf
  let f_ab = EnvBRDFApproxAB(data.roughness, data.NdotV);
  // Roughness-dependent Fresnel so smooth grazing angles still reach f90.
  let FrIBL = max(vec3f(1.0 - data.roughness), data.f0) - data.f0;
  let kS = data.f0 + FrIBL * pow(1.0 - data.NdotV, 5.0);
  let FssEss = kS * f_ab.x + data.f90 * f_ab.y;
  let Ems = 1.0 - (f_ab.x + f_ab.y);
  let Favg = data.f0 + (1.0 - data.f0) / 21.0;
  let FmsEms = Ems * FssEss * Favg / (1.0 - Favg * Ems);
  // Energy left for the diffuse lobe after single + multiple specular scattering.
  let kD = data.diffuseColor * (1.0 - FssEss + FmsEms);

  // diffuse layer
  let diffuseIrradiance = shIrradiance(sh, data.normalWorld);
  var Fd = (FmsEms + kD) * diffuseIrradiance * ao;

  if (USE_DIFFUSE_TRANSMISSION) {
    var diffuseTransmissionIBL = shIrradiance(sh, -data.normalWorld) * data.diffuseTransmissionColor;
    if (USE_VOLUME) {
      diffuseTransmissionIBL = applyVolumeAttenuation(diffuseTransmissionIBL, data.diffuseTransmissionThickness, data.attenuationColor, data.attenuationDistance);
    }
    Fd = mix(Fd, diffuseTransmissionIBL, data.diffuseTransmission);
  }

  let prefilteredRadiance = getPrefilteredReflection(data.reflectionWorld, data.roughness, prefilteredMap, prefilteredMapSampler, numMipLevels);

  var Fr = (FssEss + FmsEms) * prefilteredRadiance * ao;

  // extra ambient occlusion term for the base and subsurface layers
  multiBounceAO(ao, data.diffuseColor, &Fd);
  // multiBounceSpecularAO(specularAO, data.f0, &Fr);

  if (USE_SHEEN) {
    evaluateSheenIBL(data, ao, &Fd, &Fr, prefilteredMap, prefilteredMapSampler, numMipLevels);
  }

  if (USE_CLEAR_COAT) {
    evaluateClearCoatIBL(*data, ao, &Fd, &Fr, prefilteredMap, prefilteredMapSampler, numMipLevels);
  }

  if (USE_TRANSMISSION) {
    var Ft = getIBLVolumeRefraction(data, Fr, captureTexture, captureTextureSampler, viewportSize, modelMatrix, projectionMatrix, viewMatrix);
    Ft *= data.transmission;
    Fd *= (1.0 - data.transmission);
    data.transmitted += Ft;
  }

  data.indirectDiffuse += Fd;
  data.indirectSpecular += Fr;
}
`;
