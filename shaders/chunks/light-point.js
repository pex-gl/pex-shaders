export default /* wgsl */ `
struct PointLight {
  position: vec3f,
  color: vec4f,
  range: f32,
  castShadows: u32,
  bias: f32,
  radius: f32,
  shadowMapSize: vec2f,
};

fn EvaluatePointLight(
  data: ptr<function, PBRData>,
  light: PointLight,
  shadowMap: texture_cube<f32>,
  shadowMapSampler: sampler,
  fragCoord: vec2f
) {
  let positionToLightWorld = data.positionWorld - light.position;
  let lightDistWorld = length(positionToLightWorld);

  var illuminated = 1.0;
  if (light.castShadows != 0u) {
    illuminated = getPunctualShadow(
      shadowMap,
      shadowMapSampler,
      light.shadowMapSize,
      positionToLightWorld,
      lightDistWorld - light.bias,
      light.radius,
      fragCoord
    );
  }

  if (illuminated > 0.0) {
    let invSqrFalloff = 1.0 / pow(light.range, 2.0);
    let attenuation = getDistanceAttenuation(positionToLightWorld, invSqrFalloff);

    var l: Light;
    l.l = -normalize(positionToLightWorld);
    l.color = light.color;
    l.attenuation = attenuation;
    getSurfaceShading(data, l, illuminated);
  }
}
`;
