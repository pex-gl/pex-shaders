export default /* wgsl */ `
fn alphaTest(data: ptr<function, PBRData>, alphaCutoff: f32) {
  if (data.opacity < alphaCutoff) {
    discard;
  }
}
`;
