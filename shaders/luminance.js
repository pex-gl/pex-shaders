// ITU-R BT.709-2
export default /* wgsl */ `
fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}
`;
