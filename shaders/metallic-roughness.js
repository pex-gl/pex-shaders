// uMetallicTexture: assumes linear, TODO: check glTF
// uRoughnessTexture: assumes linear, TODO: check glTF
//
// MIN_ROUGHNESS:
// Source: Google/Filament/Overview/4.8.3.3 Roughness remapping and clamping, 07/2019
// Minimum roughness to avoid division by zerio when 1/a^2 and to limit specular aliasing
// This could be 0.045 when using single precision float fp32
export default /* wgsl */ `
const MIN_ROUGHNESS: f32 = 0.089;

fn getMetallic(data: ptr<function, PBRData>, metallic: f32) {
  data.metallic = metallic;
}

fn getMetallicTextured(
  data: ptr<function, PBRData>,
  metallic: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.metallic = metallic * textureSample(tex, texSampler, texCoord).x;
}

fn getRoughness(data: ptr<function, PBRData>, roughness: f32) {
  data.roughness = roughness + 0.01;
}

fn getRoughnessTextured(
  data: ptr<function, PBRData>,
  roughness: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.roughness = roughness * textureSample(tex, texSampler, texCoord).x + 0.01;
}

// TODO: sampling the same texture twice
fn getMetallicRoughnessTextured(
  data: ptr<function, PBRData>,
  metallic: f32,
  roughness: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  let texelColor = textureSample(tex, texSampler, texCoord);
  data.metallic = metallic * texelColor.z;
  data.roughness = roughness * texelColor.y;
}
`;
