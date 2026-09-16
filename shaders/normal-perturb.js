// Base technique: Christian Schüler, http://www.thetenthplanet.de/archives/1180
// Ng (below) solves against the flat per-pixel geometric normal — the
// cross(dp1, dp2) "GetFaceNormal" trick, see
// https://shaderlabs.org/wiki/Shader_Tricks — instead of the smooth shading
// normal N: on curved/low-poly geometry the two diverge (worse at oblique
// angles), skewing the solved T/B — see the "hard edges" case here:
// https://bgolus.medium.com/normal-mapping-for-a-triplanar-shader-10bf39dca05a
// N still becomes the output frame's normal column, so shading itself stays
// smooth.
export default /* wgsl */ `
fn cotangentFrame(N: vec3f, p: vec3f, uv: vec2f) -> mat3x3f {
  // get edge vectors of the pixel triangle
  let dp1 = dpdx(p);
  let dp2 = dpdy(p);
  let duv1 = dpdx(uv);
  let duv2 = dpdy(uv);

  var Ng = normalize(cross(dp1, dp2));
  Ng *= sign(dot(Ng, N));

  // solve the linear system
  let dp2perp = cross(dp2, Ng);
  let dp1perp = cross(Ng, dp1);
  let T = dp2perp * duv1.x + dp1perp * duv2.x;
  let B = dp2perp * duv1.y + dp1perp * duv2.y;

  // construct a scale-invariant frame
  let invmax = 1.0 / sqrt(max(dot(T, T), dot(B, B)));
  return mat3x3f(normalize(T * invmax), normalize(B * invmax), N);
}

fn perturb(map: vec3f, N: vec3f, V: vec3f, texcoord: vec2f) -> vec3f {
  let TBN = cotangentFrame(N, -V, texcoord);
  return normalize(TBN * map);
}
`;
