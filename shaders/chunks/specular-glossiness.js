export default /* wgsl */ `
fn getDiffuse(diffuse: vec4f) -> vec4f {
  return vec4f(decode(diffuse, SRGB).xyz, diffuse.w);
}

fn getDiffuseTextured(
  diffuse: vec4f,
  data: PBRData,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) -> vec4f {
  // assumes sRGB texture
  let texCoord = getTextureCoordinatesTransformed(data, texCoordIndex, texCoordTransform);
  let texelColor = textureSample(tex, texSampler, texCoord);
  return vec4f(decode(diffuse, SRGB).xyz, diffuse.w) * texelColor;
}

fn getSpecularGlossiness(specular: vec3f, glossiness: f32) -> vec4f {
  return vec4f(specular, glossiness);
}

fn getSpecularGlossinessTextured(
  specular: vec3f,
  glossiness: f32,
  data: PBRData,
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoordIndex: i32,
  texCoordTransform: mat3x3f
) -> vec4f {
  // assumes specular is sRGB and glossiness is linear
  let texCoord = getTextureCoordinatesTransformed(data, texCoordIndex, texCoordTransform);
  let specGloss = textureSample(tex, texSampler, texCoord);
  // TODO: should i move specular to linear?
  return vec4f(specular, glossiness) * specGloss;
}

// assumes linear color
fn perceivedBrightness(c: vec3f) -> f32 {
  return 0.299 * c.x + 0.587 * c.y + 0.114 * c.z;
}

fn maxComponent(c: vec3f) -> f32 {
  return max(c.x, max(c.z, c.y));
}

fn solveMetallic(diffuse: f32, specular: f32, oneMinusSpecularStrength: f32) -> f32 {
  if (specular < 0.04) {
    return 0.0;
  }

  let a = 0.04;
  let b = diffuse * oneMinusSpecularStrength / (1.0 - a) + specular - 2.0 * a;
  let c = a - specular;
  let D = max(b * b - 4.0 * a * c, 0.0);
  return saturateF32((-b + sqrt(D)) / (2.0 * a));
}

// Pass vColor as vec4f(1.0) when vertex colors are not in use.
fn getBaseColorAndMetallicRoughnessFromSpecularGlossiness(
  data: ptr<function, PBRData>,
  specularGlossiness: vec4f,
  diffuseRGBA: vec4f,
  vColor: vec4f
) {
  let specular = specularGlossiness.xyz;
  data.f0 = specular;

  let glossiness = specularGlossiness.w;
  data.roughness = 1.0 - glossiness;

  let diffuse = diffuseRGBA.xyz;
  data.opacity = diffuseRGBA.w;
  let epsilon = 1e-6;
  let a = 0.04;

  // ported from https://github.com/KhronosGroup/glTF/blob/master/extensions/Khronos/KHR_materials_pbrSpecularGlossiness/examples/convert-between-workflows/js/three.pbrUtilities.js
  let oneMinusSpecularStrength = 1.0 - maxComponent(specular);
  data.metallic = solveMetallic(perceivedBrightness(diffuse), perceivedBrightness(specular), oneMinusSpecularStrength);

  let baseColorFromDiffuse = diffuse * oneMinusSpecularStrength / (1.0 - a) / max(1.0 - data.metallic, epsilon);
  let baseColorFromSpecular = (specular - a * (1.0 - data.metallic)) * (1.0 / max(data.metallic, epsilon));
  data.baseColor = mix(baseColorFromDiffuse, baseColorFromSpecular, data.metallic * data.metallic);

  let tint = decode(vColor, SRGB).xyz;
  data.baseColor *= tint;
  data.f0 *= tint;
  data.opacity *= vColor.w;
}
`;
