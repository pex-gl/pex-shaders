import * as glslToneMap from "glsl-tone-map";

import SHADERS from "../chunks/index.js";

export default /* glsl */ `
#if (__VERSION__ < 300)
  #extension GL_OES_standard_derivatives : require
  #ifdef USE_TRANSMISSION
    #extension GL_EXT_shader_texture_lod : require
  #endif
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

// Variables
uniform vec2 uViewportSize;

uniform highp mat4 uInverseViewMatrix;
uniform highp mat4 uViewMatrix;
uniform highp mat3 uNormalMatrix;
uniform highp mat4 uModelMatrix;

uniform vec3 uCameraPosition;

uniform float uExposure;
uniform int uOutputEncoding;

varying vec3 vNormalWorld;
varying vec3 vNormalView;

varying vec2 vTexCoord0;
#ifdef USE_TEXCOORD_1
  varying vec2 vTexCoord1;
#endif

varying highp vec3 vPositionWorld;
varying highp vec3 vPositionView;

#ifdef USE_TANGENTS
  varying vec4 vTangentView;
#endif

#if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
  varying vec4 vColor;
#endif

#ifdef USE_TRANSMISSION
  uniform sampler2D uCaptureTexture;
  uniform float uRefraction;
#endif

struct PBRData {
  mat4 inverseViewMatrix;
  vec2 texCoord0;
  vec2 texCoord1;
  vec3 normalView;
  vec4 tangentView;
  vec3 positionWorld;
  vec3 positionView;
  vec3 eyeDirView;
  vec3 eyeDirWorld;
  vec3 normalWorld; // N, world space
  vec3 viewWorld; // V, view vector from position to camera, world space
  float NdotV;

  vec3 baseColor;
  vec3 emissiveColor;
  float opacity;
  float roughness; // roughness value, as authored by the model creator (input to shader)
  float metallic; // metallic value at the surface
  float linearRoughness; // roughness mapped to a more linear change in the roughness (proposed by [2])
  vec3 f0; // Reflectance at normal incidence, specular color
  float clearCoat;
  float clearCoatRoughness;
  float clearCoatLinearRoughness;
  vec3 clearCoatNormal;
  vec3 reflectionWorld;
  vec3 directColor;
  vec3 diffuseColor; // color contribution from diffuse lighting
  vec3 indirectDiffuse; // contribution from IBL light probe and Ambient Light
  vec3 indirectSpecular; // contribution from IBL light probe and Area Light
  vec3 sheenColor;
  float sheenRoughness;
  vec3 sheen;
  float sheenAlbedoScaling;
  float ao;
};

// Includes
${SHADERS.math.PI}
${SHADERS.math.TWO_PI}
${SHADERS.math.saturate}
${SHADERS.math.transposeMat3}
${SHADERS.math.multQuat}
${SHADERS.math.random}
${SHADERS.rgbm}
${SHADERS.gamma}
${SHADERS.encodeDecode}
${SHADERS.textureCoordinates}
${SHADERS.baseColor}
${SHADERS.sheenColor}
${SHADERS.alpha}
${SHADERS.ambientOcclusion}
${Object.values(glslToneMap).join("\n")}

#ifndef USE_UNLIT_WORKFLOW
  // Lighting
  ${SHADERS.octMap}
  ${SHADERS.depthUnpack}
  ${SHADERS.depthRead}
  ${SHADERS.normalPerturb}
  ${SHADERS.irradiance}
  ${SHADERS.shadowing}
  ${SHADERS.brdf}
  ${SHADERS.clearCoat}
  ${SHADERS.indirect}
  ${SHADERS.direct}
  ${SHADERS.lightAmbient}
  ${SHADERS.lightDirectional}
  ${SHADERS.lightPoint}
  ${SHADERS.lightSpot}
  ${SHADERS.lightArea}

  // Material and geometric context
  ${SHADERS.emissiveColor}
  ${SHADERS.normal}
  ${SHADERS.metallicRoughness}
  ${SHADERS.specularGlossiness}
#endif

#define HOOK_FRAG_DECLARATIONS_END

void main() {
  vec3 color;

  PBRData data;
  data.texCoord0 = vTexCoord0;

  #ifdef USE_TEXCOORD_1
    data.texCoord1 = vTexCoord1;
  #endif

  #ifdef USE_UNLIT_WORKFLOW
    getBaseColor(data);

    color = data.baseColor;

    #ifdef USE_ALPHA_TEXTURE
      #ifdef USE_ALPHA_TEXTURE_MATRIX
        vec2 alphaTexCoord = getTextureCoordinates(data, ALPHA_TEXTURE_TEX_COORD, uAlphaTextureMatrix);
      #else
        vec2 alphaTexCoord = getTextureCoordinates(data, ALPHA_TEXTURE_TEX_COORD);
      #endif
      data.opacity *= texture2D(uAlphaTexture, alphaTexCoord).r;
    #endif
    #ifdef USE_ALPHA_TEST
      alphaTest(data);
    #endif
  #else
    data.inverseViewMatrix = uInverseViewMatrix;
    data.positionWorld = vPositionWorld;
    data.positionView = vPositionView;
    // TODO: is normalization needed for normalView, tangentView, normalWorld?
    data.normalView = normalize(vNormalView);
    data.normalView *= float(gl_FrontFacing) * 2.0 - 1.0;
    #ifdef USE_TANGENTS
      data.tangentView = normalize(vTangentView);
      data.tangentView *= float(gl_FrontFacing) * 2.0 - 1.0;
    #endif
    data.normalWorld = normalize(vNormalWorld);
    data.normalWorld *= float(gl_FrontFacing) * 2.0 - 1.0;
    data.eyeDirView = normalize(-vPositionView);
    data.eyeDirWorld = vec3(uInverseViewMatrix * vec4(data.eyeDirView, 0.0));
    data.indirectDiffuse = vec3(0.0);
    data.indirectSpecular = vec3(0.0);
    data.sheen = vec3(0.0);
    data.ao = 1.0;
    data.opacity = 1.0;

    #define HOOK_FRAG_BEFORE_TEXTURES

    getNormal(data);
    getEmissiveColor(data);

    #ifdef USE_METALLIC_ROUGHNESS_WORKFLOW
      getBaseColor(data);
      getRoughness(data);
      // TODO: avoid disappearing highlights at roughness 0
      // data.roughness = 0.004 + 0.996 * data.roughness;
      data.roughness = clamp(data.roughness, MIN_ROUGHNESS, 1.0);
      getMetallic(data);
    #endif
    #ifdef USE_SPECULAR_GLOSSINESS_WORKFLOW
      getBaseColorAndMetallicRoughnessFromSpecularGlossiness(data);
      data.diffuseColor = data.baseColor * (1.0 - data.metallic);
    #endif

    #ifdef USE_ALPHA_TEXTURE
      #ifdef USE_ALPHA_TEXTURE_MATRIX
        vec2 alphaTexCoord = getTextureCoordinates(data, ALPHA_TEXTURE_TEX_COORD, uAlphaTextureMatrix);
      #else
        vec2 alphaTexCoord = getTextureCoordinates(data, ALPHA_TEXTURE_TEX_COORD);
      #endif
      data.opacity *= texture2D(uAlphaTexture, alphaTexCoord).r;
    #endif
    #ifdef USE_ALPHA_TEST
      alphaTest(data);
    #endif

    #define HOOK_FRAG_BEFORE_LIGHTING

    #ifdef USE_METALLIC_ROUGHNESS_WORKFLOW
      // Compute F0 for both dielectric and metallic materials
      data.f0 = 0.16 * uReflectance * uReflectance * (1.0 - data.metallic) + data.baseColor.rgb * data.metallic;
      data.diffuseColor = data.baseColor * (1.0 - data.metallic);
    #endif

    data.linearRoughness = data.roughness * data.roughness;
    // view vector in world space
    data.viewWorld = normalize(uCameraPosition - vPositionWorld);
    data.NdotV = clamp(abs(dot(data.normalWorld, data.viewWorld)) + FLT_EPS, 0.0, 1.0);

    #ifdef USE_CLEAR_COAT
      getClearCoat(data);
      getClearCoatRoughness(data);

      data.clearCoatLinearRoughness = data.clearCoatRoughness * data.clearCoatRoughness;
      data.f0 = mix(data.f0, f0ClearCoatToSurface(data.f0), data.clearCoat);
      data.roughness = max(data.roughness, data.clearCoatRoughness);

      getClearCoatNormal(data);
    #endif

    #ifdef USE_SHEEN
      getSheenColor(data);
      getSheenRoughness(data);
    #endif

    getAmbientOcclusion(data);

    //TODO: No kd? so not really energy conserving
    //we could use disney brdf for irradiance map to compensate for that like in Frostbite
    #ifdef USE_REFLECTION_PROBES
      data.reflectionWorld = reflect(-data.eyeDirWorld, data.normalWorld);
      EvaluateLightProbe(data, data.ao);
    #endif
    #if NUM_AMBIENT_LIGHTS > 0
      #pragma unroll_loop
      for (int i = 0; i < NUM_AMBIENT_LIGHTS; i++) {
        EvaluateAmbientLight(data, uAmbientLights[i], data.ao);
      }
    #endif
    #if NUM_DIRECTIONAL_LIGHTS > 0
      #pragma unroll_loop
      for (int i = 0; i < NUM_DIRECTIONAL_LIGHTS; i++) {
        EvaluateDirectionalLight(data, uDirectionalLights[i], uDirectionalLightShadowMaps[i]);
      }
    #endif
    #if NUM_POINT_LIGHTS > 0
      #pragma unroll_loop
      for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
        EvaluatePointLight(data, uPointLights[i], uPointLightShadowMaps[i]);
      }
    #endif
    #if NUM_SPOT_LIGHTS > 0
      #pragma unroll_loop
      for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
        EvaluateSpotLight(data, uSpotLights[i], uSpotLightShadowMaps[i]);
      }
    #endif
    #if NUM_AREA_LIGHTS > 0
      #pragma unroll_loop
      for (int i = 0; i < NUM_AREA_LIGHTS; i++) {
        EvaluateAreaLight(data, uAreaLights[i], uAreaLightShadowMaps[i], data.ao);
      }
    #endif

    #ifdef USE_TRANSMISSION
    data.indirectDiffuse  *= 0.0;//not sure how to compute it yet
    data.indirectSpecular *= 1.0;//not sure how to compute it yet
    // vec2 uv = gl_FragCoord.xy / uViewportSize.xy;
    // texture2DLodEXT(uCaptureTexture, uv, level).x;
    // data.indirectSpecular *=
    #endif

    #define HOOK_FRAG_AFTER_LIGHTING

    color = data.emissiveColor + data.indirectDiffuse + data.indirectSpecular + data.directColor;

    // TODO: verify math. is this the right place. What should be the mix factor
    #if defined(USE_SSAO) && defined(USE_SSAO_TEXTURE) && defined(USE_SSAO_COLORS)
      vec2 aoTexCoord = gl_FragCoord.xy / uViewportSize;
      vec4 aoData = texture2D(uSSAOTexture, aoTexCoord);
      float uSSAOMix = 1.0;
      vec3 rgb = mix(color.rgb, color.rgb * gtaoMultiBounce(aoData.a, color.rgb), uSSAOMix);
      color.rgb = vec3(rgb + aoData.rgb * color.rgb * 2.0);
    #endif
  #endif // USE_UNLIT_WORKFLOW

  color.rgb *= uExposure;

  #if defined(TONEMAP)
    color.rgb = TONEMAP(color.rgb);
  #endif

  gl_FragData[0] = encode(vec4(color, 1.0), uOutputEncoding);

  #ifdef USE_DRAW_BUFFERS
    #if LOCATION_NORMAL >= 0
      gl_FragData[LOCATION_NORMAL] = vec4(data.normalView * 0.5 + 0.5, 1.0);
    #endif
    #if LOCATION_EMISSIVE >= 0
      gl_FragData[LOCATION_EMISSIVE] = encode(vec4(data.emissiveColor, 1.0), uOutputEncoding);
    #endif
  #endif
  #ifdef USE_BLEND
    gl_FragData[0].a = data.opacity;
  #endif

  ${SHADERS.output.assignment}

  #define HOOK_FRAG_END
}
`;