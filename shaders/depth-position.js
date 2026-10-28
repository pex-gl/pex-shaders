// reconstructPositionFromDepth:
// view space position of a raw depth buffer sample, unprojected through the
// inverse projection: holds for perspective, orthographic, zoom and view offsets.
// Requires `depthRead`.
// https://mynameismjp.wordpress.com/2010/09/05/position-from-depth-3/
export default /* wgsl */ `
fn reconstructPositionFromDepth(texCoord: vec2f, depth: f32, inverseProjectionMatrix: mat4x4f) -> vec3f {
  // Y is negated: texCoord runs downwards, both as fragCoord over the viewport
  // and as the fullscreen pass' texCoord0, where NDC runs up.
  let ndc = vec4f(texCoord.x * 2.0 - 1.0, 1.0 - texCoord.y * 2.0, depth, 1.0);
  let position = inverseProjectionMatrix * ndc;
  // An infinite far plane's background unprojects to a direction (w = 0):
  // placed at DEPTH_MAX along it rather than divided by zero.
  return position.xyz / max(position.w, length(position.xyz) / DEPTH_MAX);
}
`;
