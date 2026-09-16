export default /* wgsl */ `
// USE_TANGENTS is expected to be declared as \`override\` bool by the
// composing pipeline shader. Pass texCoordTransform as the identity matrix
// when no texture coordinate transform is in use.

fn getNormal(data: ptr<function, PBRData>) {}

fn getNormalTextured(
  data: ptr<function, PBRData>,
  tex: texture_2d<f32>,
  texSampler: sampler,
  textureScale: f32,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f,
  frontFacing: bool
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);

  var normalMap = textureSample(tex, texSampler, texCoord).xyz * 2.0 - 1.0;
  normalMap.y *= textureScale;
  normalMap = normalize(normalMap);

  let N = normalize(data.normalView);
  let V = normalize(data.eyeDirView);

  var normalView: vec3f;

  if (USE_TANGENTS) {
    let bitangent = cross(N, data.tangentView.xyz) * sign(data.tangentView.w);
    let TBN = mat3x3f(data.tangentView.xyz, bitangent, N);
    normalView = normalize(TBN * normalMap);
  } else {
    normalMap = vec3f(normalMap.xy * select(-1.0, 1.0, frontFacing), normalMap.z);
    // make the output normalView match glTF expected right handed orientation
    normalMap.y *= -1.0;
    normalView = perturb(normalMap, N, V, texCoord);
  }
  data.normalView = normalView;
  data.normalWorld = normalize((data.inverseViewMatrix * vec4f(normalView, 0.0)).xyz);
}
`;
