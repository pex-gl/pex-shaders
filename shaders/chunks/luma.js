// ITU-R BT.601
// Assumes linear color
export default /* wgsl */ `
fn luma(color: vec3f) -> f32 {
  return dot(color, vec3f(0.299, 0.587, 0.114));
}
`;
