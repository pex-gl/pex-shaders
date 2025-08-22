export default /* glsl */ `
float average(vec3 color) {
  return (color.r + color.g + color.b) / 3.0;
}
`;
