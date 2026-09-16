// f0 and f90:
// https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_specular#implementation
// dielectricSpecularF0 = min(((ior - outside_ior) / (ior + outside_ior))^2 * specularColorFactor * specularColorTexture.rgb, float3(1.0)) * specularFactor * specularTexture.a
// dielectricSpecularF90 = specularFactor * specularTexture.a
export default /* wgsl */ `
const OUTSIDE_IOR: f32 = 1.0; // Air

fn getIor(data: ptr<function, PBRData>, ior: f32) {
  data.ior = ior;
}

fn getSpecularFromIor(data: ptr<function, PBRData>) {
  // Compute F0 for both dielectric and metallic materials
  data.f0 = mix(
    vec3f(pow((data.ior - OUTSIDE_IOR) / (data.ior + OUTSIDE_IOR), 2.0)),
    data.baseColor,
    data.metallic
  );
  data.f90 = vec3f(1.0);
}

fn applySpecular(data: ptr<function, PBRData>, specularStrength: f32, specularColorTint: vec3f) {
  data.f0 = mix(
    min(
      vec3f(pow((data.ior - OUTSIDE_IOR) / (data.ior + OUTSIDE_IOR), 2.0)) * specularColorTint,
      vec3f(1.0)
    ) * specularStrength,
    data.baseColor,
    data.metallic
  );
  data.f90 = mix(vec3f(specularStrength), vec3f(1.0), data.metallic);
}

// Pass texCoordTransform as the identity matrix when no texture coordinate
// transform is in use for a given texture slot.
fn getSpecular(data: ptr<function, PBRData>, specular: f32, specularColor: vec3f) {
  applySpecular(data, specular, specularColor);
}

// specularTexture only (no specularColorTexture): the strength is sampled from
// its alpha channel, the color stays the raw factor. Its RGB channels are
// unused — a pre-ratification draft of the extension stored specular color
// there, and sampling them tints f0 with data the final spec reserves for
// specularColorTexture.
fn getSpecularStrengthTextured(
  data: ptr<function, PBRData>,
  specular: f32,
  specularColor: vec3f,
  specularTex: texture_2d<f32>,
  specularTexSampler: sampler,
  specularTexCoordIndex: i32,
  specularTexCoordTransform: mat3x3f
) {
  let texCoordSpecular = getTextureCoordinatesTransformed(*data, specularTexCoordIndex, specularTexCoordTransform);
  applySpecular(data, specular * textureSample(specularTex, specularTexSampler, texCoordSpecular).w, specularColor);
}

// specularColorTexture only (no specularTexture): the color factor is tinted by
// the texture's RGB, the strength stays the raw factor.
fn getSpecularColorTextured(
  data: ptr<function, PBRData>,
  specular: f32,
  specularColor: vec3f,
  specularColorTex: texture_2d<f32>,
  specularColorTexSampler: sampler,
  specularColorTexCoordIndex: i32,
  specularColorTexCoordTransform: mat3x3f
) {
  let texCoordSpecularColor = getTextureCoordinatesTransformed(*data, specularColorTexCoordIndex, specularColorTexCoordTransform);
  applySpecular(data, specular, specularColor * textureSample(specularColorTex, specularColorTexSampler, texCoordSpecularColor).xyz);
}

fn getSpecularTextured(
  data: ptr<function, PBRData>,
  specular: f32,
  specularColor: vec3f,
  specularTex: texture_2d<f32>,
  specularTexSampler: sampler,
  specularTexCoordIndex: i32,
  specularTexCoordTransform: mat3x3f,
  specularColorTex: texture_2d<f32>,
  specularColorTexSampler: sampler,
  specularColorTexCoordIndex: i32,
  specularColorTexCoordTransform: mat3x3f
) {
  let texCoordSpecular = getTextureCoordinatesTransformed(*data, specularTexCoordIndex, specularTexCoordTransform);
  let specularStrength = specular * textureSample(specularTex, specularTexSampler, texCoordSpecular).w;

  let texCoordSpecularColor = getTextureCoordinatesTransformed(*data, specularColorTexCoordIndex, specularColorTexCoordTransform);
  let tintedSpecularColor = specularColor * textureSample(specularColorTex, specularColorTexSampler, texCoordSpecularColor).xyz;

  applySpecular(data, specularStrength, tintedSpecularColor);
}
`;
