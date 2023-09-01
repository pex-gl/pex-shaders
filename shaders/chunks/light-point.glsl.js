export default /* glsl */ `
#if NUM_POINT_LIGHTS > 0

struct PointLight {
  vec3 position;
  vec4 color;
  float range;
  bool castShadows;
  float bias;
  vec2 shadowMapSize;
};

uniform PointLight uPointLights[NUM_POINT_LIGHTS];
uniform samplerCube uPointLightShadowMaps[NUM_POINT_LIGHTS];

void EvaluatePointLight(inout PBRData data, PointLight light, samplerCube shadowMap) {
  vec3 positionToLightWorld = data.positionWorld - light.position;
  float lightDistWorld = length(positionToLightWorld);

  float illuminated = bool(light.castShadows)
    ? getPunctualShadow(shadowMap, light.shadowMapSize, positionToLightWorld, lightDistWorld - light.bias)
    : 1.0;

  if (illuminated > 0.0) {
    float invSqrFalloff = 1.0 / pow(light.range, 2.0);
    float attenuation = getDistanceAttenuation(positionToLightWorld, invSqrFalloff);

    Light l;
    l.l = -normalize(positionToLightWorld);
    l.color = light.color;
    l.attenuation = attenuation;
    getSurfaceShading(data, l, illuminated);
  }
}
#endif
`;
