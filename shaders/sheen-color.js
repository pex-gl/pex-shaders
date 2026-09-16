// https://github.com/KhronosGroup/glTF/blob/master/extensions/2.0/Khronos/KHR_materials_sheen/README.md#albedo-scaling-technique
// Needs LUT
// https://dassaultsystemes-technology.github.io/EnterprisePBRShadingModel/spec-2021x.md.html#appendix/energycompensation/sheenbrdf
// data.sheenAlbedoScaling = 1.0 - max3(data.sheenColor) * E(VdotN)

// Rather than using up a precious sampler to store the LUT of our integral, we instead fit a curve to the data, which  is piecewise  separated by a sheen  roughness of 0.25.
// The energy reduction from sheen only varies between 0.13 and 0.18 across  roughness, so we approximate  it as a constant value  of 0.157.
// https://drive.google.com/file/d/1T0D1VSyR4AllqIJTQAraEIzjlb5h4FKH/view?usp=sharing

// uSheenColor: gltf assumes sRGB color, not linear
// uSheenColorTexture: assumes sRGB color, not linear
export default /* wgsl */ `
// USE_SHEEN_ROUGHNESS_FROM_MAIN_TEXTURE, DEPTH_PASS_ONLY and
// DEPTH_PRE_PASS_ONLY are expected to be declared as \`override\` bool by the
// composing pipeline shader.

fn getSheenColor(data: ptr<function, PBRData>, sheenColor: vec4f) {
  if (!DEPTH_PASS_ONLY && !DEPTH_PRE_PASS_ONLY) {
    data.sheenColor = decode(sheenColor, SRGB).xyz;
  }
}

fn getSheenColorTextured(
  data: ptr<function, PBRData>,
  sheenColor: vec4f,
  sheenRoughness: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  let texelColor = textureSample(tex, texSampler, texCoord);

  if (!DEPTH_PASS_ONLY && !DEPTH_PRE_PASS_ONLY) {
    data.sheenColor = decode(sheenColor, SRGB).xyz * texelColor.xyz;
  }

  if (USE_SHEEN_ROUGHNESS_FROM_MAIN_TEXTURE) {
    data.sheenRoughness = sheenRoughness * texelColor.w;
  }
}

fn getSheenRoughness(data: ptr<function, PBRData>, sheenRoughness: f32) {
  if (!USE_SHEEN_ROUGHNESS_FROM_MAIN_TEXTURE) {
    data.sheenRoughness = sheenRoughness;
  }
}

fn getSheenRoughnessTextured(
  data: ptr<function, PBRData>,
  sheenRoughness: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.sheenRoughness = sheenRoughness * textureSample(tex, texSampler, texCoord).w;
}

fn getSheenAlbedoScaling(data: ptr<function, PBRData>) {
  data.sheenAlbedoScaling = 1.0 - 0.157 * max3(data.sheenColor);
}
`;
