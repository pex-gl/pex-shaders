// getDistanceAttenuation: https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
// sheenBRDF: The Fresnel term may be omitted, i.e., F = 1.
export default /* wgsl */ `
// color.w is the light's photometric intensity in the unit this integration
// needs: illuminance (lx) for a directional light, luminous intensity (cd) for
// point and spot, since \`intensity * attenuation\` is the illuminance reaching
// the surface.
struct Light {
  l: vec3f,
  color: vec4f,
  attenuation: f32,
};

fn getDistanceAttenuation(posToLight: vec3f, falloff: f32) -> f32 {
  // Square Falloff Attenuation
  let distanceSquare = dot(posToLight, posToLight);
  let factor = distanceSquare * falloff;
  let smoothFactor = saturateF32(1.0 - factor * factor);
  let attenuation = smoothFactor * smoothFactor;

  return attenuation * 1.0 / max(distanceSquare, 1e-4);
}

fn getAngleAttenuation(lightDir: vec3f, l: vec3f, scaleOffset: vec2f) -> f32 {
  let cd = dot(lightDir, l);
  let attenuation = saturateF32(cd * scaleOffset.x + scaleOffset.y);
  return attenuation * attenuation;
}

// USE_SHEEN, USE_CLEARCOAT, USE_NORMAL_TEXTURE, USE_CLEARCOAT_NORMAL_TEXTURE,
// USE_DIFFUSE_TRANSMISSION, USE_VOLUME and USE_TRANSMISSION are expected to be
// declared as \`override\` bool by the composing pipeline shader.

fn sheenBRDF(data: PBRData, NdotH: f32, NdotV: f32, NdotL: f32) -> vec3f {
  let sheenDistribution = D_Charlie(data.sheenLinearRoughness, NdotH);
  let sheenVisibility = V_Charlie(data.sheenLinearRoughness, NdotV, NdotL, NdotH);
  return data.sheenColor * sheenDistribution * sheenVisibility;
}

fn clearcoatBRDF(data: PBRData, h: vec3f, NoH: f32, LoH: f32, Fcc: ptr<function, f32>) -> f32 {
  var clearcoatNoH = NoH;
  if (USE_NORMAL_TEXTURE || USE_CLEARCOAT_NORMAL_TEXTURE) {
    clearcoatNoH = saturateF32(dot(data.clearcoatNormal, h));
  }
  let D = D_GGX(data.clearcoatLinearRoughness, clearcoatNoH);
  let V = V_Kelemen(LoH);
  let F = F_SchlickClearcoat(LoH) * data.clearcoat;

  *Fcc = F;
  return D * V * F;
}

fn getSurfaceShading(data: ptr<function, PBRData>, light: Light, illuminated: f32) {
  let N = data.normalWorld;
  let V = data.viewWorld;
  let L = normalize(light.l);
  let H = normalize(V + L);

  let NdotV = saturateF32(abs(dot(N, V)) + FLT_EPS);
  let NdotL = saturateF32(dot(N, L));

  if (NdotL <= 0.0 || NdotV <= 0.0) {
    return;
  }

  let NdotH = saturateF32(dot(N, H));
  let LdotH = saturateF32(dot(L, H));
  let HdotV = max(0.0, dot(H, V));

  let F = SpecularReflection(data.f0, data.f90, HdotV);
  let D = MicrofacetDistribution(data.linearRoughness, NdotH);
  let Vis = VisibilityOcclusion(data.linearRoughness, NdotL, NdotV);

  // TODO: switch to linear colors
  let lightColor = decode(light.color, SRGB).xyz;

  var Fd = DiffuseLambert() * data.diffuseColor;
  let Fr = F * Vis * D;

  // Multiple-scattering compensation for the base specular lobe: single-scatter
  // Cook-Torrance loses energy at high roughness, so scale it back up. Uses the
  // same DFG as the indirect (Fdez-Agüera) path to stay consistent.
  let energyCompensation = getEnergyCompensation(data.f0, data.roughness, NdotV);

  if (USE_DIFFUSE_TRANSMISSION) {
    var diffuse_btdf = light.attenuation * saturateF32(dot(-N, L)) * (DiffuseLambert() * data.diffuseTransmissionColor);

    if (USE_VOLUME) {
      diffuse_btdf = applyVolumeAttenuation(diffuse_btdf, data.diffuseTransmissionThickness, data.attenuationColor, data.attenuationDistance);
    }
    Fd = mix(Fd, diffuse_btdf, data.diffuseTransmission);
  }

  if (USE_TRANSMISSION) {
    Fd *= (1.0 - data.transmission);
  }

  var color = Fd + Fr * energyCompensation;

  if (USE_SHEEN) {
    color *= data.sheenAlbedoScaling;
    color += sheenBRDF(*data, NdotH, NdotV, NdotL);
  }

  if (USE_CLEARCOAT) {
    var Fcc = 0.0;
    let clearcoat = clearcoatBRDF(*data, H, NdotH, LdotH, &Fcc);
    let attenuation = 1.0 - Fcc;

    color *= attenuation * NdotL;

    // direct light still uses NdotL but clear coat needs separate dot product when using normal map
    // if only normal map is present not clear coat normal map, we will get smooth coating on top of bumpy surface
    if (USE_NORMAL_TEXTURE || USE_CLEARCOAT_NORMAL_TEXTURE) {
      let clearcoatNoL = saturateF32(dot(data.clearcoatNormal, light.l));
      color += clearcoat * clearcoatNoL;
    } else {
      color += clearcoat * NdotL;
    }
  } else {
    color *= NdotL;
  }

  data.directColor += (color * lightColor) * (light.color.w * light.attenuation * illuminated);
}
`;
