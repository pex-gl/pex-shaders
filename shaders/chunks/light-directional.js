export default /* wgsl */ `
struct DirectionalLight {
  direction: vec3f,
  color: vec4f,
  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f,
  castShadows: u32,
  near: f32,
  far: f32,
  bias: f32,
  radiusUV: vec2f,
  shadowMapSize: vec2f,
};

fn EvaluateDirectionalLight(
  data: ptr<function, PBRData>,
  light: DirectionalLight,
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
      true,
      fragCoord
    );
  }

  if (illuminated > 0.0) {
    var l: Light;
    l.l = -light.direction;
    l.color = light.color;
    l.attenuation = 1.0;
    getSurfaceShading(data, l, illuminated);
  }
}
`;
