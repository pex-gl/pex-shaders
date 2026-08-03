// from http://spidergl.org/example.php?id=6
export default /* wgsl */ `
// DEPTH_PACK_FAR is expected to be declared as \`override\` f32 by the
// composing pipeline shader (shared with depth-unpack.js and pcf.js).

fn packDepth(depth: f32) -> vec4f {
  let bit_shift = vec4f(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
  let bit_mask = vec4f(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
  var res = fract(depth * bit_shift);
  res -= res.xxyz * bit_mask;
  return res;
}
`;
