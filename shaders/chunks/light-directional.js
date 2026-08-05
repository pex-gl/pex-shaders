export default /* wgsl */ `
struct DirectionalLight {
  direction: vec3f,
  color: vec4f,
  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f,
  castShadows: u32,
  near: f32,
  far: f32,
  radiusUV: vec2f,
  shadowMapSize: vec2f,
};

fn EvaluateDirectionalLight(
  data: ptr<function, PBRData>,
  light: DirectionalLight,
  shadowMap: texture_depth_2d,
  shadowMapSampler: sampler_comparison,
  positionWorld: vec3f,
  fragCoord: vec2f
) {
  // Camera-independent normal-offset bias before projection. Orthographic frustum
  // height is distance-independent: 2/projection[1][1] over the map size.
  let NdotL = dot(data.normalWorld, -light.direction);
  let texelWorldSize = 2.0 / (abs(light.projectionMatrix[1][1]) * light.shadowMapSize.y);
  let shadowPos = normalOffsetBias(positionWorld, data.normalWorld, NdotL, texelWorldSize);

  let lightViewPosition = light.viewMatrix * vec4f(shadowPos, 1.0);
  let lightDeviceCoordsPosition = light.projectionMatrix * lightViewPosition;
  let lightDeviceCoordsPositionNormalized = lightDeviceCoordsPosition.xyz / lightDeviceCoordsPosition.w;
  // WebGPU texture origin is top-left, so flip v relative to clip space.
  let lightUV = vec2f(
    lightDeviceCoordsPositionNormalized.x * 0.5 + 0.5,
    0.5 - lightDeviceCoordsPositionNormalized.y * 0.5,
  );
  // Computed here (uniform control flow) so the receiver-plane bias can use
  // screen-space derivatives; the shadow lookup below is behind a branch.
  let dzDuv = depthGradient(lightUV, lightDeviceCoordsPositionNormalized.z);

  var illuminated = 1.0;
  if (light.castShadows != 0u) {
    illuminated = getShadow(
      shadowMap,
      shadowMapSampler,
      light.shadowMapSize,
      lightUV,
      lightDeviceCoordsPositionNormalized.z,
      light.near,
      light.far,
      light.radiusUV,
      dzDuv,
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
