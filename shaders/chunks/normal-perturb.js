// http://www.thetenthplanet.de/archives/1180
export default /* wgsl */ `
fn cotangentFrame(N: vec3f, p: vec3f, uv: vec2f) -> mat3x3f {
  // get edge vectors of the pixel triangle
  let dp1 = dpdx(p);
  let dp2 = dpdy(p);
  let duv1 = dpdx(uv);
  let duv2 = dpdy(uv);

  // solve the linear system
  let dp2perp = cross(dp2, N);
  let dp1perp = cross(N, dp1);
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
