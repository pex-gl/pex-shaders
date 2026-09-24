export default /* wgsl */ `
fn EvaluateDirectionalLight(
  data: ptr<function, PBRData>,
  light: SceneLight,
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
    illuminated = sampleShadowMap2D(
      light.shadowBucket,
      light.shadowLayer,
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
