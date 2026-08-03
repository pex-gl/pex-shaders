// reconstructPositionFromDepth:
// asumming z comes from depth buffer (ndc coords) and it's not a linear distance from the camera but
// perpendicular to the near/far clipping planes
// http://mynameismjp.wordpress.com/2010/09/05/position-from-depth-3/
// assumes z = eye space z
export default /* wgsl */ `
fn getFarViewDir(texCoord: vec2f, fov: f32, far: f32, viewportSize: vec2f) -> vec3f {
  let hfar = 2.0 * tan(fov / 2.0) * far;
  let wfar = hfar * viewportSize.x / viewportSize.y;
  return vec3f(wfar * (texCoord.x - 0.5), hfar * (texCoord.y - 0.5), -far);
}

fn getViewRay(texCoord: vec2f, fov: f32, far: f32, viewportSize: vec2f) -> vec3f {
  return normalize(getFarViewDir(texCoord, fov, far, viewportSize));
}

fn reconstructPositionFromDepth(texCoord: vec2f, z: f32, fov: f32, far: f32, viewportSize: vec2f) -> vec3f {
  let ray = getFarViewDir(texCoord, fov, far, viewportSize);
  return ray * z / far;
}
`;
