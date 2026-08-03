export default /* wgsl */ `
fn alphaTest(data: ptr<function, PBRData>, alphaTestThreshold: f32) {
  if (data.opacity < alphaTestThreshold) {
    discard;
  }
}
`;
