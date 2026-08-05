export default /* wgsl */ `
struct PointLight {
  position: vec3f,
  color: vec4f,
  range: f32,
  castShadows: u32,
  bias: f32,
  radius: f32,
  shadowMapSize: vec2f,
  far: f32,
};

fn EvaluatePointLight(
  data: ptr<function, PBRData>,
  light: PointLight,
  shadowMap: texture_depth_cube,
  shadowMapSampler: sampler,
  fragCoord: vec2f
) {
  let positionToLightWorld = data.positionWorld - light.position;

  var illuminated = 1.0;
  if (light.castShadows != 0u) {
    // The cube stores normalized radial distance from the light; compare the
    // receiver's own normalized distance. bias is a relative epsilon (scales
    // with far), so it stays scene-adaptive.
    let compare = length(positionToLightWorld) / light.far - light.bias;

    illuminated = getPunctualShadow(
      shadowMap,
      shadowMapSampler,
      light.shadowMapSize,
      positionToLightWorld,
      compare,
      light.radius,
      light.far,
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
