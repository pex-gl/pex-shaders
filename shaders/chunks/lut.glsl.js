export default /* glsl */ `
vec4 lut(vec4 textureColor, sampler2D lookupTable, float lutSize) {
  float blueColor = textureColor.b * 63.0;

  vec2 quad1;
  quad1.y = floor(floor(blueColor) / 8.0);
  quad1.x = floor(blueColor) - (quad1.y * 8.0);

  vec2 quad2;
  quad2.y = floor(ceil(blueColor) / 8.0);
  quad2.x = ceil(blueColor) - (quad2.y * 8.0);

  float invSize = 1.0 / lutSize;
  float invHalfSize = 0.5 / lutSize;

  return mix(
    texture2D(
      lookupTable,
      vec2(
        (quad1.x * 0.125) + invHalfSize + ((0.125 - invSize) * textureColor.r),
        (quad1.y * 0.125) + invHalfSize + ((0.125 - invSize) * textureColor.g)
      )
    ),
    texture2D(
      lookupTable,
      vec2(
        (quad2.x * 0.125) + invHalfSize + ((0.125 - invSize) * textureColor.r),
        (quad2.y * 0.125) + invHalfSize + ((0.125 - invSize) * textureColor.g)
      )
    ),
    fract(blueColor)
  );
}
`;
