// Based on http://http.developer.nvidia.com/GPUGems/gpugems_ch17.html and http://gl.ict.usc.edu/Data/HighResProbes/
// flipEnvMap:
// - -1.0 for left handed coorinate system oriented texture (usual case)
// - 1.0 for right handed coorinate system oriented texture
//
// I assume envMap texture has been flipped the WebGL way (pixel 0,0 is a the bottom)
// therefore we flip wcNorma.y as acos(1) = 0
export default /* wgsl */ `
fn envMapEquirect(wcNormal: vec3f) -> vec2f {
  let flipEnvMap = -1.0;
  let phi = acos(-wcNormal.y);
  let theta = atan2(wcNormal.x, flipEnvMap * wcNormal.z) + PI;
  return vec2f(theta / TWO_PI, phi / PI);
}
`;
