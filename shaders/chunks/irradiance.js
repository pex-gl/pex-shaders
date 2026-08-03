export default /* wgsl */ `
fn getIrradiance(normalWorld: vec3f, map: texture_2d<f32>, mapSampler: sampler, width: f32, encoding: i32) -> vec3f {
  var uv = envMapOctahedral(normalWorld);
  let irrSize = 64.0;
  uv += 0.5 / irrSize;
  uv /= irrSize / (irrSize - 1.0);
  uv = (uv * irrSize + vec2f(width - irrSize)) / width;
  return decode(textureSample(map, mapSampler, uv), encoding).xyz;
}
`;
