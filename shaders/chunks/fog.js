/**
 * Fog
 *
 * Adapted from from Iñigo Quilez article: https://iquilezles.org/articles/fog/
 *
 * @type {string}
 * @alias module:chunks.fog
 */
export default /* wgsl */ `
fn fog(
  rgb: vec3f,
  dist: f32,
  rayDir: vec3f,
  sunDir: vec3f,
  fogDensity: f32,
  sunColor: vec3f,
  sunDispertion: f32,
  sunIntensity: f32,
  inscatteringCoeffs: vec3f,
  fogColor: vec3f
) -> vec3f {
  let sunColorLinear = toLinearVec3(sunColor);
  let fogColorLinear = toLinearVec3(fogColor);

  let minSc = 0.02;
  let density = -(dist + 1.0) * fogDensity * 0.15 - dist * 0.0025;
  var sunAmount = pow(max(dot(rayDir, sunDir), 0.0), 1.0 / (0.008 + sunDispertion * 3.0));
  sunAmount = sunIntensity * 10.0 * pow(sunAmount, 10.0);
  sunAmount = max(0.0, min(sunAmount, 1.0));
  let sunFogColor = mix(fogColorLinear, sunColorLinear, sunAmount);
  let insColor = vec3f(1.0) - saturateVec3(vec3f(
    exp(density * (inscatteringCoeffs.x + minSc)),
    exp(density * (inscatteringCoeffs.y + minSc)),
    exp(density * (inscatteringCoeffs.z + minSc))
  ));

  return mix(rgb, sunFogColor, insColor);
}
`;
