export default /* wgsl */ `
fn getTransmission(data: ptr<function, PBRData>, transmission: f32) {
  data.transmission = transmission;
}

fn getTransmissionTextured(
  data: ptr<function, PBRData>,
  transmission: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.transmission = transmission * textureSample(tex, texSampler, texCoord).x;
}

fn applyIorToRoughness(roughness: f32, ior: f32) -> f32 {
  // Scale roughness with IOR so that an IOR of 1.0 results in no microfacet refraction and
  // an IOR of 1.5 results in the default amount of microfacet refraction.
  return roughness * saturateF32(ior * 2.0 - 2.0);
}

fn getVolumeTransmissionRay(n: vec3f, v: vec3f, thickness: f32, ior: f32, modelMatrix: mat4x4f) -> vec3f {
  // Direction of refracted light.
  let refractionVector = refract(-v, normalize(n), 1.0 / ior);

  // Compute rotation-independant scaling of the model matrix.
  var modelScale: vec3f;
  modelScale.x = length(modelMatrix[0].xyz);
  modelScale.y = length(modelMatrix[1].xyz);
  modelScale.z = length(modelMatrix[2].xyz);

  // The thickness is specified in local space.
  return normalize(refractionVector) * thickness * modelScale;
}

// WGSL has no isInf builtin: doubling a true IEEE-754 infinity leaves it
// unchanged, which is a portable way to detect it.
fn isInfF32(x: f32) -> bool {
  return x != 0.0 && x * 2.0 == x;
}

// Compute attenuated light as it travels through a volume.
fn applyVolumeAttenuation(radiance: vec3f, transmissionDistance: f32, attenuationColor: vec3f, attenuationDistance: f32) -> vec3f {
  if (isInfF32(attenuationDistance) || attenuationDistance == 0.0) {
    // Attenuation distance is +∞ (which we indicate by zero or infinity), i.e. the transmitted color is not attenuated at all.
    return radiance;
  } else {
    // Compute light attenuation using Beer's law.
    let transmittance = pow(attenuationColor, vec3f(transmissionDistance / attenuationDistance));
    return transmittance * radiance;
  }
}

fn getThickness(data: ptr<function, PBRData>, thickness: f32) {
  data.thickness = thickness;
}

fn getThicknessTextured(
  data: ptr<function, PBRData>,
  thickness: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.thickness = thickness * textureSample(tex, texSampler, texCoord).y;
}

fn getAttenuation(data: ptr<function, PBRData>, attenuationColor: vec3f, attenuationDistance: f32) {
  data.attenuationColor = attenuationColor;
  data.attenuationDistance = attenuationDistance;
}

// USE_VOLUME is expected to be declared as \`override\` bool by the composing pipeline shader.
fn getDiffuseTransmission(
  data: ptr<function, PBRData>,
  diffuseTransmission: f32,
  diffuseTransmissionColor: vec3f,
  modelMatrix: mat4x4f
) {
  data.diffuseTransmission = diffuseTransmission;
  data.diffuseTransmissionColor = diffuseTransmissionColor;

  if (USE_VOLUME) {
    data.diffuseTransmissionThickness = data.thickness
      * (length(modelMatrix[0].xyz) + length(modelMatrix[1].xyz) + length(modelMatrix[2].xyz)) / 3.0;
  } else {
    data.diffuseTransmissionThickness = 1.0;
  }
}

fn getDiffuseTransmissionTextured(
  data: ptr<function, PBRData>,
  diffuseTransmission: f32,
  diffuseTransmissionColor: vec3f,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f,
  colorTex: texture_2d<f32>,
  colorTexSampler: sampler,
  colorTexCoordIndex: i32,
  colorTexCoordTransform: mat3x3f,
  modelMatrix: mat4x4f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  let diffuseTransmissionStrength = diffuseTransmission * textureSample(tex, texSampler, texCoord).w;

  let colorTexCoord = getTextureCoordinatesTransformed(*data, colorTexCoordIndex, colorTexCoordTransform);
  let tintedDiffuseTransmissionColor = diffuseTransmissionColor * textureSample(colorTex, colorTexSampler, colorTexCoord).xyz;

  data.diffuseTransmission = diffuseTransmissionStrength;
  data.diffuseTransmissionColor = tintedDiffuseTransmissionColor;

  if (USE_VOLUME) {
    data.diffuseTransmissionThickness = data.thickness
      * (length(modelMatrix[0].xyz) + length(modelMatrix[1].xyz) + length(modelMatrix[2].xyz)) / 3.0;
  } else {
    data.diffuseTransmissionThickness = 1.0;
  }
}

// "Mipped Bicubic Texture Filtering" (https://www.shadertoy.com/view/4df3Dn)
const ONE_OVER_SIX: f32 = 1.0 / 6.0;

fn textureBicubicW0(a: f32) -> f32 {
  return ONE_OVER_SIX * (a * (a * (-a + 3.0) - 3.0) + 1.0);
}

fn textureBicubicW1(a: f32) -> f32 {
  return ONE_OVER_SIX * (a * a * (3.0 * a - 6.0) + 4.0);
}

fn textureBicubicW2(a: f32) -> f32 {
  return ONE_OVER_SIX * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0);
}

fn textureBicubicW3(a: f32) -> f32 {
  return ONE_OVER_SIX * (a * a * a);
}

// g0 and g1 are the two amplitude functions
fn textureBicubicG0(a: f32) -> f32 {
  return textureBicubicW0(a) + textureBicubicW1(a);
}

fn textureBicubicG1(a: f32) -> f32 {
  return textureBicubicW2(a) + textureBicubicW3(a);
}

// h0 and h1 are the two offset functions
fn textureBicubicH0(a: f32) -> f32 {
  return -1.0 + textureBicubicW1(a) / (textureBicubicW0(a) + textureBicubicW1(a));
}

fn textureBicubicH1(a: f32) -> f32 {
  return 1.0 + textureBicubicW3(a) / (textureBicubicW2(a) + textureBicubicW3(a));
}

fn textureBicubicSample(tex: texture_2d<f32>, texSampler: sampler, uvIn: vec2f, texelSize: vec4f, lod: f32) -> vec4f {
  let uv = uvIn * texelSize.zw + 0.5;

  let iuv = floor(uv);
  let fuv = fract(uv);

  let g0x = textureBicubicG0(fuv.x);
  let g1x = textureBicubicG1(fuv.x);
  let h0x = textureBicubicH0(fuv.x);
  let h1x = textureBicubicH1(fuv.x);
  let h0y = textureBicubicH0(fuv.y);
  let h1y = textureBicubicH1(fuv.y);

  let p0 = (vec2f(iuv.x + h0x, iuv.y + h0y) - 0.5) * texelSize.xy;
  let p1 = (vec2f(iuv.x + h1x, iuv.y + h0y) - 0.5) * texelSize.xy;
  let p2 = (vec2f(iuv.x + h0x, iuv.y + h1y) - 0.5) * texelSize.xy;
  let p3 = (vec2f(iuv.x + h1x, iuv.y + h1y) - 0.5) * texelSize.xy;

  return (
    textureBicubicG0(fuv.y) *
      (g0x * textureSampleLevel(tex, texSampler, p0, lod) + g1x * textureSampleLevel(tex, texSampler, p1, lod)) +
    textureBicubicG1(fuv.y) *
      (g0x * textureSampleLevel(tex, texSampler, p2, lod) + g1x * textureSampleLevel(tex, texSampler, p3, lod))
  );
}

fn textureBicubic(tex: texture_2d<f32>, texSampler: sampler, uv: vec2f, lod: f32) -> vec4f {
  let lodSizeFloor = vec2f(textureDimensions(tex, u32(lod)));
  let lodSizeCeil = vec2f(textureDimensions(tex, u32(lod + 1.0)));

  let lodSizeFloorInv = 1.0 / lodSizeFloor;
  let lodSizeCeilInv = 1.0 / lodSizeCeil;

  let floorSample = textureBicubicSample(tex, texSampler, uv, vec4f(lodSizeFloorInv, lodSizeFloor), floor(lod));
  let ceilSample = textureBicubicSample(tex, texSampler, uv, vec4f(lodSizeCeilInv, lodSizeCeil), ceil(lod));

  return mix(floorSample, ceilSample, fract(lod));
}
`;
