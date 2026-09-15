// uEmissive: gltf assumes sRGB color, not linear
// uEmissiveTexture: assumes sRGB color, not linear
export default /* wgsl */ `
// Pass vColor as vec4f(1.0) and texCoordTransform as the identity matrix
// when vertex colors / texture coordinate transforms are not in use.

fn getEmissive(
  data: ptr<function, PBRData>,
  emissive: vec4f,
  emissiveStrength: f32,
  vColor: vec4f
) {
  data.emissive = emissiveStrength * decode(emissive, SRGB).xyz * decode(vColor, SRGB).xyz;
}

fn getEmissiveTextured(
  data: ptr<function, PBRData>,
  emissive: vec4f,
  emissiveStrength: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f,
  vColor: vec4f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.emissive = textureSample(tex, texSampler, texCoord).xyz
    * emissiveStrength * decode(emissive, SRGB).xyz * decode(vColor, SRGB).xyz;
}
`;
