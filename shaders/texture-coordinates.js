export default /* wgsl */ `
// USE_TEXCOORD_1 is expected to be declared as \`override\` bool by the composing pipeline shader.

fn getTextureCoordinates(data: PBRData, index: i32) -> vec2f {
  if (USE_TEXCOORD_1 && index == 1) {
    return data.texCoord1;
  }

  return data.texCoord0;
}

fn getTextureCoordinatesTransformed(data: PBRData, index: i32, texCoordTransform: mat3x3f) -> vec2f {
  let texCoord = getTextureCoordinates(data, index);

  return (texCoordTransform * vec3f(texCoord.xy, 1.0)).xy;
}
`;
