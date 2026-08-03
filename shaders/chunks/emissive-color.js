// uEmissiveColor: gltf assumes sRGB color, not linear
// uEmissiveColorTexture: assumes sRGB color, not linear
export default /* wgsl */ `
// Pass vColor as vec4f(1.0) and texCoordTransform as the identity matrix
// when vertex colors / texture coordinate transforms are not in use.

fn getEmissiveColor(data: ptr<function, PBRData>) {
  data.emissiveColor = vec3f(0.0);
}

fn getEmissiveColorFactor(
  data: ptr<function, PBRData>,
  emissiveColor: vec4f,
  emissiveIntensity: f32,
  vColor: vec4f
) {
  data.emissiveColor = emissiveIntensity * decode(emissiveColor, SRGB).xyz * decode(vColor, SRGB).xyz;
}

fn getEmissiveColorTextured(
  data: ptr<function, PBRData>,
  emissiveColor: vec4f,
  emissiveIntensity: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f,
  vColor: vec4f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.emissiveColor = textureSample(tex, texSampler, texCoord).xyz
    * emissiveIntensity * decode(emissiveColor, SRGB).xyz * decode(vColor, SRGB).xyz;
}
`;
