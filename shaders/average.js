export default /* wgsl */ `
fn average(color: vec3f) -> f32 {
  return (color.x + color.y + color.z) / 3.0;
}
`;
