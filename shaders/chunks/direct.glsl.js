export default /* glsl */ `
struct Light {
  vec3 l;
  vec4 color;
  float attenuation;
};

// https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
float getDistanceAttenuation(const highp vec3 posToLight, float falloff) {
  // Square Falloff Attenuation
  float distanceSquare = dot(posToLight, posToLight);
  float factor = distanceSquare * falloff;
  float smoothFactor = saturate(1.0 - factor * factor);
  float attenuation = smoothFactor * smoothFactor;

  return attenuation * 1.0 / max(distanceSquare, 1e-4);
}

float getAngleAttenuation(const vec3 lightDir, const vec3 l, const vec2 scaleOffset) {
  float cd = dot(lightDir, l);
  float attenuation  = saturate(cd * scaleOffset.x + scaleOffset.y);
  return attenuation * attenuation;
}

vec2 compensateStretch(vec2 uv) {
  return uv;
  // float u = uv.x;
  // u = (u - 0.5) * 1.1 + 0.5;
  // return vec2(u, uv.y);
}

#ifdef USE_SHEEN
  vec3 sheenBRDF(const PBRData data, float NdotH, float NdotV, float NdotL) {
    float sheenDistribution = D_Charlie(data.sheenLinearRoughness, NdotH);
    float sheenVisibility = V_Charlie(data.sheenLinearRoughness, NdotV, NdotL, NdotH);
    // float sheenVisibility = V_Neubelt(NdotV, NdotL, NdotH);

    // The Fresnel term may be omitted, i.e., F = 1.
    return data.sheenColor * sheenDistribution * sheenVisibility;
  }
#endif

#ifdef USE_CLEAR_COAT
  float clearCoatBRDF(const PBRData data, const vec3 h, float NoH, float LoH, out float Fcc) {
    #if defined(USE_NORMAL_TEXTURE) || defined(USE_CLEAR_COAT_NORMAL_TEXTURE)
      float clearCoatNoH = saturate(dot(data.clearCoatNormal, h));
    #else
      float clearCoatNoH = NoH;
    #endif
    float D = D_GGX(data.clearCoatLinearRoughness, clearCoatNoH, h, data.normalWorld);
    float V = V_Kelemen(LoH);
    // air-polyurethane interface has IOR = 1.5 -> F0 = 0.04
    float F = F_Schlick(0.04, 1.0, LoH) * data.clearCoat;

    Fcc = F;
    return D * V * F;
  }
#endif

// #ifdef USE_TRANSMISSION
//   // TODO: check what's already computed (normalized normal, ndotv etc)
//   vec3 getPunctualRadianceTransmission(
//     vec3 normal,
//     vec3 view,
//     vec3 pointToLight,
//     float alphaRoughness,
//     vec3 f0,
//     vec3 f90,
//     vec3 baseColor,
//     float ior
//   ) {
//       float transmissionRougness = applyIorToRoughness(alphaRoughness, ior);

//       vec3 n = normalize(normal); // Outward direction of surface point
//       vec3 v = normalize(view); // Direction from surface point to view
//       vec3 l = normalize(pointToLight);
//       vec3 l_mirror = normalize(l + 2.0*n*dot(-l, n));     // Mirror light reflection vector on surface
//       vec3 h = normalize(l_mirror + v); // Halfway vector between transmission light vector and v

//       // float D = D_GGX(clamp(dot(n, h), 0.0, 1.0), transmissionRougness);
//       // vec3 F = F_Schlick(f0, f90, clamp(dot(v, h), 0.0, 1.0));
//       // float Vis = V_GGX(clamp(dot(n, l_mirror), 0.0, 1.0), clamp(dot(n, v), 0.0, 1.0), transmissionRougness);
//       float D = D_GGX(clamp(dot(n, h), 0.0, 1.0), transmissionRougness);
//       vec3 F = F_Schlick(f0, f90, clamp(dot(v, h), 0.0, 1.0));
//       float Vis = VisibilityOcclusion(clamp(dot(n, l_mirror), 0.0, 1.0), clamp(dot(n, v), 0.0, 1.0), transmissionRougness);

//       // Transmission BTDF
//       return (1.0 - F) * baseColor * D * Vis;
//   }
// #endif

void getSurfaceShading(inout PBRData data, Light light, float illuminated) {
  vec3 N = data.normalWorld;
  vec3 V = data.viewWorld;
  vec3 L = normalize(light.l);
  vec3 H = normalize(V + L);

  float NdotV = saturate(abs(dot(N, V)) + FLT_EPS);
  float NdotL = saturate(dot(N, L));

  if (NdotL <= 0.0 || NdotV <= 0.0) return;

  float NdotH = saturate(dot(N, H));
  float LdotH = saturate(dot(L, H));
  float HdotV = max(0.0, dot(H, V));

  vec3 F = SpecularReflection(data.f0, HdotV);
  float D = MicrofacetDistribution(data.linearRoughness, NdotH);
  float Vis = VisibilityOcclusion(data.linearRoughness, NdotL, NdotV);

  //TODO: switch to linear colors
  vec3 lightColor = decode(light.color, SRGB).rgb;

  vec3 Fd = DiffuseLambert() * data.diffuseColor;
  vec3 Fr = F * Vis * D;

  //TODO: energy compensation
  float energyCompensation = 1.0;

  #ifdef USE_TRANSMISSION
    Fd *= (1.0 - data.transmission);
  #endif

  vec3 color = Fd + Fr * energyCompensation;

  #ifdef USE_SHEEN
    color *= data.sheenAlbedoScaling;
    color += sheenBRDF(data, NdotH, NdotV, NdotL);
  #endif

  #ifdef USE_CLEAR_COAT
    float Fcc;
    float clearCoat = clearCoatBRDF(data, H, NdotH, LdotH, Fcc);
    float attenuation = 1.0 - Fcc;

    color *= attenuation * NdotL;

    // direct light still uses NdotL but clear coat needs separate dot product when using normal map
    // if only normal map is present not clear coat normal map, we will get smooth coating on top of bumpy surface
    #if defined(USE_NORMAL_TEXTURE) || defined(USE_CLEAR_COAT_NORMAL_TEXTURE)
      float clearCoatNoL = saturate(dot(data.clearCoatNormal, light.l));
      color += clearCoat * clearCoatNoL;
    #else
      color += clearCoat * NdotL;
    #endif
  #else
    color *= NdotL;
  #endif

  data.directColor += (color * lightColor) * (light.color.a * light.attenuation * illuminated);

  // BTDF (Bidirectional Transmittance Distribution Function)
  // #ifdef USE_TRANSMISSION
  //   vec3 pointToLight = light.l;

  //   // If the light ray travels through the geometry, use the point it exits the geometry again.
  //   // That will change the angle to the light source, if the material refracts the light ray.
  //   vec3 transmissionRay = getVolumeTransmissionRay(N, V, data.thickness, data.ior, uModelMatrix);
  //   pointToLight -= transmissionRay;
  //   L = normalize(pointToLight);

  //   // vec3 intensity = getLighIntensity(light, pointToLight);
  //   vec3 transmittedLight =
  //     // intensity *
  //     light.attenuation *
  //     getPunctualRadianceTransmission(
  //       N,
  //       V,
  //       L,
  //       data.linearRoughness,
  //       data.f0,
  //       data.f90,
  //       data.diffuseColor,
  //       data.ior
  //     );

  //   transmittedLight = applyVolumeAttenuation(
  //     transmittedLight,
  //     length(transmissionRay),
  //     data.attenuationColor,
  //     data.attenuationDistance
  //   );

  //   data.transmitted += transmittedLight;
  //   // data.transmitted += vec3(.0, 1.0, 0.0);
  // #endif
}
`;
