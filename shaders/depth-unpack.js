export default /* wgsl */ `
// DEPTH_PACK_FAR is expected to be declared as \`override\` f32 by the
// composing pipeline shader (shared with depth-pack.js and pcf.js).

fn unpackDepth(rgba_depth: vec4f) -> f32 {
  let bit_shift = vec4f(1.0 / (256.0 * 256.0 * 256.0), 1.0 / (256.0 * 256.0), 1.0 / 256.0, 1.0);
  return dot(rgba_depth, bit_shift);
}
`;
