// reconstructPositionFromDepth:
// asumming z comes from depth buffer (ndc coords) and it's not a linear distance from the camera but
// perpendicular to the near/far clipping planes
// http://mynameismjp.wordpress.com/2010/09/05/position-from-depth-3/
// assumes z = eye space z
export default /* glsl */ `
vec3 getFarViewDir(vec2 texCoord) {
  float hfar = 2.0 * tan(uFov/2.0) * uFar;
  float wfar = hfar * uViewportSize.x / uViewportSize.y;
  vec3 dir = (vec3(wfar * (texCoord.x - 0.5), hfar * (texCoord.y - 0.5), -uFar));
  return dir;
}

vec3 getViewRay(vec2 texCoord) {
  return normalize(getFarViewDir(texCoord));
}

vec3 reconstructPositionFromDepth(vec2 texCoord, float z) {
  vec3 ray = getFarViewDir(texCoord);
  vec3 pos = ray;
  return pos * z / uFar;
}
`;
