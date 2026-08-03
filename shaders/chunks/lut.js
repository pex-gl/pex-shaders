export default /* wgsl */ `
fn lut(textureColor: vec4f, lookupTable: texture_2d<f32>, lookupTableSampler: sampler, lutSize: f32) -> vec4f {
  let blueColor = textureColor.z * 63.0;

  var quad1: vec2f;
  quad1.y = floor(floor(blueColor) / 8.0);
  quad1.x = floor(blueColor) - (quad1.y * 8.0);

  var quad2: vec2f;
  quad2.y = floor(ceil(blueColor) / 8.0);
  quad2.x = ceil(blueColor) - (quad2.y * 8.0);

  let invSize = 1.0 / lutSize;
  let invHalfSize = 0.5 / lutSize;

  return mix(
    textureSample(
      lookupTable,
      lookupTableSampler,
      vec2f(
        (quad1.x * 0.125) + invHalfSize + ((0.125 - invSize) * textureColor.x),
        (quad1.y * 0.125) + invHalfSize + ((0.125 - invSize) * textureColor.y)
      )
    ),
    textureSample(
      lookupTable,
      lookupTableSampler,
      vec2f(
        (quad2.x * 0.125) + invHalfSize + ((0.125 - invSize) * textureColor.x),
        (quad2.y * 0.125) + invHalfSize + ((0.125 - invSize) * textureColor.y)
      )
    ),
    fract(blueColor)
  );
}
`;
