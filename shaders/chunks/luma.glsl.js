// ITU-R BT.601
// Assumes linear color
export default /* glsl */ `
float luma(in vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}
`;
