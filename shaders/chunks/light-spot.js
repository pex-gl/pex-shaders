export default /* wgsl */ `
struct SpotLight {
  position: vec3f,
  direction: vec3f,
  color: vec4f,
  innerAngle: f32,
  angle: f32,
  range: f32,
  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f,
  castShadows: u32,
  near: f32,
  far: f32,
  bias: f32,
  radiusUV: vec2f,
  shadowMapSize: vec2f,
};

fn EvaluateSpotLight(
  data: ptr<function, PBRData>,
  light: SpotLight,
  shadowMap: texture_2d<f32>,
  shadowMapSampler: sampler,
  positionWorld: vec3f,
  fragCoord: vec2f
) {
  let lightViewPosition = light.viewMatrix * vec4f(positionWorld, 1.0);
  let lightDistView = -lightViewPosition.z;
  let lightDeviceCoordsPosition = light.projectionMatrix * lightViewPosition;
  let lightDeviceCoordsPositionNormalized = lightDeviceCoordsPosition.xyz / lightDeviceCoordsPosition.w;
  let lightUV = lightDeviceCoordsPositionNormalized.xy * 0.5 + 0.5;

  var illuminated = 1.0;
  if (light.castShadows != 0u) {
    illuminated = getShadow(
      shadowMap,
      shadowMapSampler,
      light.shadowMapSize,
      lightUV,
      lightDistView - light.bias,
      light.near,
      light.far,
      lightDeviceCoordsPositionNormalized.z,
      light.radiusUV,
      false,
      fragCoord
    );
  }

  if (illuminated > 0.0) {
    let posToLight = light.position - data.positionWorld;

    let invSqrFalloff = 1.0 / pow(light.range, 2.0);
    var attenuation = getDistanceAttenuation(posToLight, invSqrFalloff);

    // TODO: luminous power to intensity
    let cosOuter = cos(light.angle);
    let cosInner = cos(light.innerAngle);
    let scale = 1.0 / max(1.0 / 1024.0, cosInner - cosOuter);
    let offset = -cosOuter * scale;

    let scaleOffset = vec2f(scale, offset);
    attenuation *= getAngleAttenuation(-light.direction, normalize(posToLight), scaleOffset);

    var l: Light;
    l.l = normalize(posToLight);
    l.color = light.color;
    l.attenuation = attenuation;
    getSurfaceShading(data, l, illuminated);
  }
}
`;
