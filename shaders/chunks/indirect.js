export default /* wgsl */ `
// USE_REFLECTION_PROBES, USE_CLEAR_COAT, USE_NORMAL_TEXTURE, USE_CLEAR_COAT_NORMAL_TEXTURE,
// USE_SHEEN, USE_TRANSMISSION, USE_DISPERSION, USE_DIFFUSE_TRANSMISSION and USE_VOLUME
// are expected to be declared as \`override\` bool by the composing pipeline shader.

const MAX_MIPMAP_LEVEL: f32 = 5.0;

fn getPrefilteredReflection(
  reflected: vec3f,
  roughness: f32,
  reflectionMap: texture_2d<f32>,
  reflectionMapSampler: sampler,
  reflectionMapSize: f32
) -> vec3f {
  let lod = pow(roughness, 2.0) * MAX_MIPMAP_LEVEL; // TODO: verify reflection probe blurring code
  // let lod = pow(roughness, 1.5) * MAX_MIPMAP_LEVEL;
  let upLod = floor(lod);
  let downLod = ceil(lod);

  let a = textureSample(reflectionMap, reflectionMapSampler, envMapOctahedralAtlas(reflected, 0.0, upLod, reflectionMapSize)).xyz;
  let b = textureSample(reflectionMap, reflectionMapSampler, envMapOctahedralAtlas(reflected, 0.0, downLod, reflectionMapSize)).xyz;

  return mix(a, b, lod - upLod);
}

// https://www.unrealengine.com/en-US/blog/physically-based-shading-on-mobile
fn EnvBRDFApprox(specularColor: vec3f, specularF90: vec3f, roughness: f32, NoV: f32) -> vec3f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022);
  let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let r = roughness * c0 + c1;
  let a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  let AB = vec2f(-1.04, 1.04) * a004 + r.zw;
  return specularColor * AB.x + specularF90 * AB.y;
}

// https://google.github.io/filament/Filament.md.html#lighting/imagebasedlights/clearcoat
fn evaluateClearCoatIBL(
  data: PBRData,
  ao: f32,
  Fd: ptr<function, vec3f>,
  Fr: ptr<function, vec3f>,
  reflectionMap: texture_2d<f32>,
  reflectionMapSampler: sampler,
  reflectionMapSize: f32
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
  *Fr += getPrefilteredReflection(clearCoatR, data.clearCoatRoughness, reflectionMap, reflectionMapSampler, reflectionMapSize) * (ao * Fc);
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
  reflectionMap: texture_2d<f32>,
  reflectionMapSampler: sampler,
  reflectionMapSize: f32
) {
  // Albedo scaling of the base layer before we layer sheen on top
  *Fd *= data.sheenAlbedoScaling;
  *Fr *= data.sheenAlbedoScaling;

  var reflectance = data.sheenColor * IBLSheenBRDF(data.sheenRoughness, data.sheenLinearRoughness, data.NdotV);
  reflectance *= ao;
  *Fr += reflectance * getPrefilteredReflection(data.reflectionWorld, data.sheenRoughness, reflectionMap, reflectionMapSampler, reflectionMapSize);
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
  reflectionMap: texture_2d<f32>,
  reflectionMapSampler: sampler,
  reflectionMapSize: f32,
  captureTexture: texture_2d<f32>,
  captureTextureSampler: sampler,
  viewportSize: vec2f,
  modelMatrix: mat4x4f,
  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f
) {
  // TODO: energyCompensation
  let energyCompensation = 1.0;

  // diffuse layer
  let diffuseIrradiance = getIrradiance(data.normalWorld, reflectionMap, reflectionMapSampler, reflectionMapSize, LINEAR);
  var Fd = data.diffuseColor * diffuseIrradiance * ao;

  if (USE_DIFFUSE_TRANSMISSION) {
    var diffuseTransmissionIBL = getIrradiance(-data.normalWorld, reflectionMap, reflectionMapSampler, reflectionMapSize, LINEAR) * data.diffuseTransmissionColor;
    if (USE_VOLUME) {
      diffuseTransmissionIBL = applyVolumeAttenuation(diffuseTransmissionIBL, data.diffuseTransmissionThickness, data.attenuationColor, data.attenuationDistance);
    }
    Fd = mix(Fd, diffuseTransmissionIBL, data.diffuseTransmission);
  }

  let specularReflectance = EnvBRDFApprox(data.f0, data.f90, data.roughness, data.NdotV);
  let prefilteredRadiance = getPrefilteredReflection(data.reflectionWorld, data.roughness, reflectionMap, reflectionMapSampler, reflectionMapSize);

  var Fr = specularReflectance * prefilteredRadiance * ao;
  Fr *= energyCompensation;

  // extra ambient occlusion term for the base and subsurface layers
  multiBounceAO(ao, data.diffuseColor, &Fd);
  // multiBounceSpecularAO(specularAO, data.f0, &Fr);

  if (USE_SHEEN) {
    evaluateSheenIBL(data, ao, &Fd, &Fr, reflectionMap, reflectionMapSampler, reflectionMapSize);
  }

  if (USE_CLEAR_COAT) {
    evaluateClearCoatIBL(*data, ao, &Fd, &Fr, reflectionMap, reflectionMapSampler, reflectionMapSize);
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
