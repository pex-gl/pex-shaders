export default /* wgsl */ `
// USE_CLEARCOAT_ROUGHNESS_FROM_MAIN_TEXTURE and USE_TANGENTS are expected
// to be declared as \`override\` bool by the composing pipeline shader.

fn getClearcoat(data: ptr<function, PBRData>, clearcoat: f32) {
  data.clearcoat = clearcoat;
}

fn getClearcoatTextured(
  data: ptr<function, PBRData>,
  clearcoat: f32,
  clearcoatRoughness: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  let texelColor = textureSample(tex, texSampler, texCoord);

  data.clearcoat = clearcoat * texelColor.x;

  if (USE_CLEARCOAT_ROUGHNESS_FROM_MAIN_TEXTURE) {
    data.clearcoatRoughness = clearcoatRoughness * texelColor.y;
  }
}

fn getClearcoatRoughness(data: ptr<function, PBRData>, clearcoatRoughness: f32) {
  if (!USE_CLEARCOAT_ROUGHNESS_FROM_MAIN_TEXTURE) {
    data.clearcoatRoughness = clearcoatRoughness;
  }
}

fn getClearcoatRoughnessTextured(
  data: ptr<function, PBRData>,
  clearcoatRoughness: f32,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) {
  let texCoord = getTextureCoordinatesTransformed(*data, texCoordIndex, texCoordTransform);
  data.clearcoatRoughness = clearcoatRoughness * textureSample(tex, texSampler, texCoord).y;
}

fn getClearcoatNormalTextured(
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

  data.clearcoatNormal = normalize((data.inverseViewMatrix * vec4f(normalView, 0.0)).xyz);
}

// geometricNormalView: the un-perturbed geometric normal (world/view varying),
// distinct from data.normalView which may already carry base normal-map perturbation.
fn getClearcoatNormal(data: ptr<function, PBRData>, geometricNormalView: vec3f) {
  data.clearcoatNormal = normalize((data.inverseViewMatrix * vec4f(normalize(geometricNormalView), 0.0)).xyz);
}

// IOR = 1.5, F0 = 0.04
// as material is no longer in contact with air we calculate new IOR on the
// clear coat and material interface
fn f0ClearcoatToSurface(f0: vec3f) -> vec3f {
  return saturateVec3(f0 * (f0 * (0.941892 - 0.263008 * f0) + 0.346479) - 0.0285998);
}
`;
