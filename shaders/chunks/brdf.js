// Distribution:
// https://google.github.io/filament/Filament.md.html#materialsystem/specularbrdf
// Walter et al. 2007, "Microfacet Models for Refraction through Rough Surfaces"
// Used by: clearCoat
const D_GGX = /* wgsl */ `
fn D_GGX(linearRoughness: f32, NoH: f32) -> f32 {
  let oneMinusNoHSquared = 1.0 - NoH * NoH;
  let a = NoH * linearRoughness;
  let k = linearRoughness / (oneMinusNoHSquared + a * a);
  let d = k * k * (1.0 / PI);
  return saturateMediump(d);
}
`;

// Estevez and Kulla 2017, "Production Friendly Microfacet Sheen BRDF"
// https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf
// https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_sheen/README.md#sheen-distribution
// Used by: sheen
const D_Charlie = /* wgsl */ `
fn D_Charlie(linearRoughness: f32, NoH: f32) -> f32 {
  let invAlpha = 1.0 / linearRoughness;
  let cos2h = NoH * NoH;
  // let sin2h = max(1.0 - cos2h, 0.0078125); // 2^(-14/2), so sin2h^2 > 0 in fp16
  let sin2h = 1.0 - cos2h;
  return (2.0 + invAlpha) * pow(sin2h, invAlpha * 0.5) / (2.0 * PI);
}
`;

// Visibility:
// Kelemen 2001, "A Microfacet Based Coupled Specular-Matte BRDF Model with Importance Sampling"
// Used by: clearCoat
const V_Kelemen = /* wgsl */ `
fn V_Kelemen(LoH: f32) -> f32 {
  return saturateMediump(0.25 / (LoH * LoH));
}
`;

// Estevez and Kulla 2017, "Production Friendly Microfacet Sheen BRDF"
// https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_sheen.pdf
// https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_sheen/README.md#sheen-distribution
// Used by: sheen
const V_Charlie = /* wgsl */ `
fn Sheen_l(x: f32, alphaG: f32) -> f32 {
  let oneMinusAlphaSq = (1.0 - alphaG) * (1.0 - alphaG);
  let a = mix(21.5473, 25.3245, oneMinusAlphaSq);
  let b = mix(3.82987, 3.32435, oneMinusAlphaSq);
  let c = mix(0.19823, 0.16801, oneMinusAlphaSq);
  let d = mix(-1.97760, -1.27393, oneMinusAlphaSq);
  let e = mix(-4.32054, -4.85967, oneMinusAlphaSq);
  return a / (1.0 + b * pow(x, c)) + d * x + e;
}
fn lambdaSheen(cosTheta: f32, alphaG: f32) -> f32 {
  return select(
    exp(2.0 * Sheen_l(0.5, alphaG) - Sheen_l(1.0 - cosTheta, alphaG)),
    exp(Sheen_l(cosTheta, alphaG)),
    abs(cosTheta) < 0.5
  );
}
fn V_Charlie(linearRoughness: f32, NdotV: f32, NdotL: f32, NdotH: f32) -> f32 {
  return 1.0 / ((1.0 + lambdaSheen(NdotV, linearRoughness) + lambdaSheen(NdotL, linearRoughness)) * (4.0 * NdotV * NdotL));
}
`;

// Fresnel:
// Assumes an air-polyurethane interface with a fixed IOR of 1.5 (4% reflectance, IOR = 1.5 -> F0 = 0.04).
// Used by: clearCoat
const F_SchlickClearCoat = /* wgsl */ `
fn F_SchlickClearCoat(VoH: f32) -> f32 {
  return 0.04 + 0.96 * pow(1.0 - VoH, 5.0);
}
`;

// Diffuse:
const DiffuseLambert = /* wgsl */ `
fn DiffuseLambert() -> f32 {
  return 1.0 / PI;
}
`;

// Base layer:
// GGX, Trowbridge-Reitz
// Same as glTF2.0 PBR Spec
const MicrofacetDistribution = /* wgsl */ `
fn MicrofacetDistribution(linearRoughness: f32, NdotH: f32) -> f32 {
  let a2 = linearRoughness * linearRoughness;
  let NdotH2 = NdotH * NdotH;

  let nom = a2;
  var denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;

  if (denom > 0.0) {
    return nom / denom;
  } else {
    return 1.0;
  }
}
`;

// FresnelSchlick
// Same as glTF2.0 PBR Spec
const SpecularReflection = /* wgsl */ `
fn SpecularReflection(f0: vec3f, f90: vec3f, HdotV: f32) -> vec3f {
  let cosTheta = HdotV;
  return f0 + (f90 - f0) * pow(1.0 - cosTheta, 5.0);
}
`;

// Smith Joint GGX
// Sometimes called Smith GGX Correlated
// Note: Vis = G / (4 * NdotL * NdotV)
// see Eric Heitz. 2014. Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs. Journal of Computer Graphics Techniques, 3
// see Real-Time Rendering. Page 331 to 336.
// see https://google.github.io/filament/Filament.md.html#materialsystem/specularbrdf/geometricshadowing(specularg)
const VisibilityOcclusion = /* wgsl */ `
fn VisibilityOcclusion(linearRoughness: f32, NdotL: f32, NdotV: f32) -> f32 {
  let linearRoughnessSq = linearRoughness * linearRoughness;

  let GGXV = NdotL * sqrt(NdotV * NdotV * (1.0 - linearRoughnessSq) + linearRoughnessSq);
  let GGXL = NdotV * sqrt(NdotL * NdotL * (1.0 - linearRoughnessSq) + linearRoughnessSq);

  let GGX = GGXV + GGXL;
  if (GGX > 0.0) {
    return 0.5 / GGX;
  }
  return 0.0;
}
`;

// Analytic environment BRDF (DFG) fit returning the split-sum scale/bias, so the
// specular reflectance is f0 * AB.x + f90 * AB.y. Shared by the indirect split-sum
// specular and the direct/indirect multiscatter energy compensation below.
// https://www.unrealengine.com/en-US/blog/physically-based-shading-on-mobile
const EnvBRDFApproxAB = /* wgsl */ `
fn EnvBRDFApproxAB(roughness: f32, NoV: f32) -> vec2f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022);
  let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let r = roughness * c0 + c1;
  let a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  return vec2f(-1.04, 1.04) * a004 + r.zw;
}
`;

// Multiple-scattering energy compensation for a single specular lobe (Turquin
// 2019 / Kulla-Conty). Ess is the single-scattering directional albedo (white
// furnace, F = 1) from the DFG; the energy it misses is added back scaled by f0.
// Applied to the specular lobe of direct lighting; the indirect path uses the
// fuller Fdez-Agüera model but the same DFG, keeping the two consistent.
// https://blog.selfshadow.com/publications/turquin/ms_comp_final.pdf
const getEnergyCompensation = /* wgsl */ `
fn getEnergyCompensation(f0: vec3f, roughness: f32, NoV: f32) -> vec3f {
  let dfg = EnvBRDFApproxAB(roughness, NoV);
  let Ess = dfg.x + dfg.y;
  return 1.0 + f0 * (1.0 / Ess - 1.0);
}
`;

export default /* wgsl */ `
${D_GGX}
${D_Charlie}
${V_Kelemen}
${V_Charlie}
${F_SchlickClearCoat}

${DiffuseLambert}
${MicrofacetDistribution}
${SpecularReflection}
${VisibilityOcclusion}
${EnvBRDFApproxAB}
${getEnergyCompensation}
`;
