export default /* wgsl */ `
fn EvaluateSpotLight(
  data: ptr<function, PBRData>,
  light: SceneLight,
  positionWorld: vec3f,
  fragCoord: vec2f
) {
  // Camera-independent normal-offset bias before projection. texelWorldSize is
  // the perspective frustum width at the receiver over the map size:
  // 2·dist·tan(halfFovY)/size, with tan(halfFovY) = 1/projection[1][1].
  let L = normalize(light.position - positionWorld);
  let NdotL = dot(data.normalWorld, L);
  let receiverDist = -(light.viewMatrix * vec4f(positionWorld, 1.0)).z;
  let texelWorldSize = 2.0 * max(receiverDist, 0.0) / (abs(light.projectionMatrix[1][1]) * light.shadowMapSize.y);
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
      false,
      fragCoord
    );
  }

  if (illuminated > 0.0) {
    let posToLight = light.position - data.positionWorld;

    var attenuation = getDistanceAttenuation(posToLight, light.invSqrFalloff);

    let cosOuter = cos(light.outerConeAngle);
    let cosInner = cos(light.innerConeAngle);
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
