export default /* glsl */ `
// ITU-R BT.709-2
float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}
`;
