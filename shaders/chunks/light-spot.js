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
  radiusUV: vec2f,
  shadowMapSize: vec2f,
};

fn EvaluateSpotLight(
  data: ptr<function, PBRData>,
  light: SpotLight,
  shadowMap: texture_depth_2d,
  shadowMapSampler: sampler_comparison,
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
