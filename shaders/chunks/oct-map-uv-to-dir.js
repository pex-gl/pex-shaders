export default /* wgsl */ `
fn signedVec2(v: vec2f) -> vec2f {
  return step(vec2f(0.0), v) * 2.0 - 1.0;
}

// size = target octMap size
fn octMapUVToDirSized(uvIn: vec2f, size: f32) -> vec3f {
  // center pixels with texels
  // https://msdn.microsoft.com/en-us/library/windows/desktop/bb219690(v=vs.85).aspx
  // creates 2 pixel border on the seams so the texture will filter properly
  // uv = (uv * size - 0.5) / (size - 1.0); // THIS!!!

  var uv = uvIn * 2.0 - 1.0;

  let auv = abs(uv);
  let len = dot(auv, vec2f(1.0));

  if (len > 1.0) {
    // y < 0 case
    uv = (auv.yx - 1.0) * -1.0 * signedVec2(uv);
  }
  return normalize(vec3f(uv.x, 1.0 - len, uv.y));
}

// size = target octMap size
fn octMapUVToDir(uvIn: vec2f) -> vec3f {
  // center pixels with texels
  // https://msdn.microsoft.com/en-us/library/windows/desktop/bb219690(v=vs.85).aspx
  // uv = (uv * size - 0.5) / (size - 1.0); // THIS!!!

  var uv = uvIn * 2.0 - 1.0;

  let auv = abs(uv);
  let len = dot(auv, vec2f(1.0));

  if (len > 1.0) {
    // y < 0 case
    uv = (auv.yx - 1.0) * -1.0 * signedVec2(uv);
  }
  return normalize(vec3f(uv.x, 1.0 - len, uv.y));
}
`;
