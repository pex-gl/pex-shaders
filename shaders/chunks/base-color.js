// uBaseColor: gltf assumes sRGB color, not linear
// uBaseColorTexture: assumes sRGB color, not linear
export default /* wgsl */ `
// DEPTH_PASS_ONLY and DEPTH_PRE_PASS_ONLY are expected to be declared as
// \`override\` bool by the composing pipeline shader. Pass vColor as
// vec4f(1.0) and texCoordTransform as the identity matrix when vertex
// colors / texture coordinate transforms are not in use.

fn getBaseColor(data: ptr<function, PBRData>, baseColor: vec4f, vColor: vec4f) {
  if (!DEPTH_PASS_ONLY && !DEPTH_PRE_PASS_ONLY) {
    data.baseColor = decode(baseColor, SRGB).xyz * decode(vColor, SRGB).xyz;
  }
  data.opacity = baseColor.w * vColor.w;
}

fn getBaseColorTextured(
  data: ptr<function, PBRData>,
  baseColor: vec4f,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f,
  vColor: vec4f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  let texelColor = textureSample(tex, texSampler, texCoord);

  if (!DEPTH_PASS_ONLY && !DEPTH_PRE_PASS_ONLY) {
    data.baseColor = decode(baseColor, SRGB).xyz * texelColor.xyz * decode(vColor, SRGB).xyz;
  }
  data.opacity = baseColor.w * texelColor.w * vColor.w;
}
`;
