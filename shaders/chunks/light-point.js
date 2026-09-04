export default /* wgsl */ `
struct PointLight {
  position: vec3f,
  color: vec4f,
  invSqrFalloff: f32,
  castShadows: u32,
  shadowBucket: u32,
  shadowLayer: u32,
  bias: f32,
  radius: f32,
  shadowMapSize: vec2f,
  far: f32,
};

fn EvaluatePointLight(
  data: ptr<function, PBRData>,
  light: PointLight,
  fragCoord: vec2f
) {
  let positionToLightWorld = data.positionWorld - light.position;

  var illuminated = 1.0;
  if (light.castShadows != 0u) {
    // The cube stores normalized radial distance from the light; compare the
    // receiver's own normalized distance. bias is a relative epsilon (scales
    // with far), so it stays scene-adaptive.
    let compare = length(positionToLightWorld) / light.far - light.bias;

    illuminated = sampleShadowMapCube(
      light.shadowBucket,
      light.shadowLayer,
      light.shadowMapSize,
      positionToLightWorld,
      compare,
      light.radius,
      light.far,
      fragCoord
    );
  }

  if (illuminated > 0.0) {
    let attenuation = getDistanceAttenuation(positionToLightWorld, light.invSqrFalloff);

    var l: Light;
    l.l = -normalize(positionToLightWorld);
    l.color = light.color;
    l.attenuation = attenuation;
    getSurfaceShading(data, l, illuminated);
  }
}
`;
