/**
 * Reference Implementation: https://github.com/stegu/webgl-noise
 *
 * Copyright (C) 2011 by Ashima Arts (Simplex noise) Copyright (C) 2011-2016 by
 * Stefan Gustavson (Classic noise and others)
 *
 * @type {object}
 * @alias module:chunks.noise
 */
const common = /* wgsl */ `
fn mod289F32(x: f32) -> f32 {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
fn mod289Vec2(x: vec2f) -> vec2f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
fn mod289Vec3(x: vec3f) -> vec3f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
fn mod289Vec4(x: vec4f) -> vec4f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permuteF32(x: f32) -> f32 {
  return mod289F32(((x * 34.0) + 10.0) * x);
}
fn permuteVec3(x: vec3f) -> vec3f {
  return mod289Vec3(((x * 34.0) + 10.0) * x);
}
fn permuteVec4(x: vec4f) -> vec4f {
  return mod289Vec4(((x * 34.0) + 10.0) * x);
}

fn taylorInvSqrtF32(r: f32) -> f32 {
  return 1.79284291400159 - 0.85373472095314 * r;
}
fn taylorInvSqrtVec4(r: vec4f) -> vec4f {
  return vec4f(1.79284291400159) - 0.85373472095314 * r;
}

fn fadeVec2(t: vec2f) -> vec2f {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
fn fadeVec3(t: vec3f) -> vec3f {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}
fn fadeVec4(t: vec4f) -> vec4f {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn grad4(j: f32, ip: vec4f) -> vec4f {
  let ones = vec4f(1.0, 1.0, 1.0, -1.0);
  var p: vec4f;

  p = vec4f(floor(fract(vec3f(j) * ip.xyz) * 7.0) * ip.z - 1.0, p.w);
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  let s = vec4f(p < vec4f(0.0));
  p = vec4f(p.xyz + (s.xyz * 2.0 - 1.0) * s.www, p.w);

  return p;
}

// (sqrt(5) - 1)/4 = F4, used once below
const F4: f32 = 0.309016994374947451;
`;

const perlin = /* wgsl */ `
// 2D
// Classic Perlin noise
fn cnoiseVec2(P: vec2f) -> f32 {
  var Pi = floor(P.xyxy) + vec4f(0.0, 0.0, 1.0, 1.0);
  let Pf = fract(P.xyxy) - vec4f(0.0, 0.0, 1.0, 1.0);
  Pi = mod289Vec4(Pi); // To avoid truncation effects in permutation
  let ix = Pi.xzxz;
  let iy = Pi.yyww;
  let fx = Pf.xzxz;
  let fy = Pf.yyww;

  let i = permuteVec4(permuteVec4(ix) + iy);

  var gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  let gy = abs(gx) - 0.5;
  let tx = floor(gx + 0.5);
  gx = gx - tx;

  var g00 = vec2f(gx.x, gy.x);
  var g10 = vec2f(gx.y, gy.y);
  var g01 = vec2f(gx.z, gy.z);
  var g11 = vec2f(gx.w, gy.w);

  let norm = taylorInvSqrtVec4(vec4f(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;

  let n00 = dot(g00, vec2f(fx.x, fy.x));
  let n10 = dot(g10, vec2f(fx.y, fy.y));
  let n01 = dot(g01, vec2f(fx.z, fy.z));
  let n11 = dot(g11, vec2f(fx.w, fy.w));

  let fade_xy = fadeVec2(Pf.xy);
  let n_x = mix(vec2f(n00, n01), vec2f(n10, n11), fade_xy.x);
  let n_xy = mix(n_x.x, n_x.y, fade_xy.y);
  return 2.3 * n_xy;
}

// Classic Perlin noise, periodic variant
fn pnoiseVec2(P: vec2f, rep: vec2f) -> f32 {
  var Pi = floor(P.xyxy) + vec4f(0.0, 0.0, 1.0, 1.0);
  let Pf = fract(P.xyxy) - vec4f(0.0, 0.0, 1.0, 1.0);
  Pi = glslModVec4(Pi, rep.xyxy); // To create noise with explicit period
  Pi = mod289Vec4(Pi);            // To avoid truncation effects in permutation
  let ix = Pi.xzxz;
  let iy = Pi.yyww;
  let fx = Pf.xzxz;
  let fy = Pf.yyww;

  let i = permuteVec4(permuteVec4(ix) + iy);

  var gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  let gy = abs(gx) - 0.5;
  let tx = floor(gx + 0.5);
  gx = gx - tx;

  var g00 = vec2f(gx.x, gy.x);
  var g10 = vec2f(gx.y, gy.y);
  var g01 = vec2f(gx.z, gy.z);
  var g11 = vec2f(gx.w, gy.w);

  let norm = taylorInvSqrtVec4(vec4f(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;

  let n00 = dot(g00, vec2f(fx.x, fy.x));
  let n10 = dot(g10, vec2f(fx.y, fy.y));
  let n01 = dot(g01, vec2f(fx.z, fy.z));
  let n11 = dot(g11, vec2f(fx.w, fy.w));

  let fade_xy = fadeVec2(Pf.xy);
  let n_x = mix(vec2f(n00, n01), vec2f(n10, n11), fade_xy.x);
  let n_xy = mix(n_x.x, n_x.y, fade_xy.y);
  return 2.3 * n_xy;
}

// 3D
// Classic Perlin noise
fn cnoiseVec3(P: vec3f) -> f32 {
  var Pi0 = floor(P); // Integer part for indexing
  var Pi1 = Pi0 + vec3f(1.0); // Integer part + 1
  Pi0 = mod289Vec3(Pi0);
  Pi1 = mod289Vec3(Pi1);
  let Pf0 = fract(P); // Fractional part for interpolation
  let Pf1 = Pf0 - vec3f(1.0); // Fractional part - 1.0
  let ix = vec4f(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  let iy = vec4f(Pi0.yy, Pi1.yy);
  let iz0 = vec4f(Pi0.zzzz);
  let iz1 = vec4f(Pi1.zzzz);

  let ixy = permuteVec4(permuteVec4(ix) + iy);
  let ixy0 = permuteVec4(ixy + iz0);
  let ixy1 = permuteVec4(ixy + iz1);

  var gx0 = ixy0 * (1.0 / 7.0);
  var gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  var gz0 = vec4f(0.5) - abs(gx0) - abs(gy0);
  let sz0 = step(gz0, vec4f(0.0));
  gx0 -= sz0 * (step(vec4f(0.0), gx0) - 0.5);
  gy0 -= sz0 * (step(vec4f(0.0), gy0) - 0.5);

  var gx1 = ixy1 * (1.0 / 7.0);
  var gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  var gz1 = vec4f(0.5) - abs(gx1) - abs(gy1);
  let sz1 = step(gz1, vec4f(0.0));
  gx1 -= sz1 * (step(vec4f(0.0), gx1) - 0.5);
  gy1 -= sz1 * (step(vec4f(0.0), gy1) - 0.5);

  var g000 = vec3f(gx0.x, gy0.x, gz0.x);
  var g100 = vec3f(gx0.y, gy0.y, gz0.y);
  var g010 = vec3f(gx0.z, gy0.z, gz0.z);
  var g110 = vec3f(gx0.w, gy0.w, gz0.w);
  var g001 = vec3f(gx1.x, gy1.x, gz1.x);
  var g101 = vec3f(gx1.y, gy1.y, gz1.y);
  var g011 = vec3f(gx1.z, gy1.z, gz1.z);
  var g111 = vec3f(gx1.w, gy1.w, gz1.w);

  let norm0 = taylorInvSqrtVec4(vec4f(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  let norm1 = taylorInvSqrtVec4(vec4f(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  let n000 = dot(g000, Pf0);
  let n100 = dot(g100, vec3f(Pf1.x, Pf0.yz));
  let n010 = dot(g010, vec3f(Pf0.x, Pf1.y, Pf0.z));
  let n110 = dot(g110, vec3f(Pf1.xy, Pf0.z));
  let n001 = dot(g001, vec3f(Pf0.xy, Pf1.z));
  let n101 = dot(g101, vec3f(Pf1.x, Pf0.y, Pf1.z));
  let n011 = dot(g011, vec3f(Pf0.x, Pf1.yz));
  let n111 = dot(g111, Pf1);

  let fade_xyz = fadeVec3(Pf0);
  let n_z = mix(vec4f(n000, n100, n010, n110), vec4f(n001, n101, n011, n111), fade_xyz.z);
  let n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  let n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}

// Classic Perlin noise, periodic variant
fn pnoiseVec3(P: vec3f, rep: vec3f) -> f32 {
  var Pi0 = glslModVec3(floor(P), rep); // Integer part, modulo period
  var Pi1 = glslModVec3(Pi0 + vec3f(1.0), rep); // Integer part + 1, mod period
  Pi0 = mod289Vec3(Pi0);
  Pi1 = mod289Vec3(Pi1);
  let Pf0 = fract(P); // Fractional part for interpolation
  let Pf1 = Pf0 - vec3f(1.0); // Fractional part - 1.0
  let ix = vec4f(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  let iy = vec4f(Pi0.yy, Pi1.yy);
  let iz0 = vec4f(Pi0.zzzz);
  let iz1 = vec4f(Pi1.zzzz);

  let ixy = permuteVec4(permuteVec4(ix) + iy);
  let ixy0 = permuteVec4(ixy + iz0);
  let ixy1 = permuteVec4(ixy + iz1);

  var gx0 = ixy0 * (1.0 / 7.0);
  var gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  var gz0 = vec4f(0.5) - abs(gx0) - abs(gy0);
  let sz0 = step(gz0, vec4f(0.0));
  gx0 -= sz0 * (step(vec4f(0.0), gx0) - 0.5);
  gy0 -= sz0 * (step(vec4f(0.0), gy0) - 0.5);

  var gx1 = ixy1 * (1.0 / 7.0);
  var gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  var gz1 = vec4f(0.5) - abs(gx1) - abs(gy1);
  let sz1 = step(gz1, vec4f(0.0));
  gx1 -= sz1 * (step(vec4f(0.0), gx1) - 0.5);
  gy1 -= sz1 * (step(vec4f(0.0), gy1) - 0.5);

  var g000 = vec3f(gx0.x, gy0.x, gz0.x);
  var g100 = vec3f(gx0.y, gy0.y, gz0.y);
  var g010 = vec3f(gx0.z, gy0.z, gz0.z);
  var g110 = vec3f(gx0.w, gy0.w, gz0.w);
  var g001 = vec3f(gx1.x, gy1.x, gz1.x);
  var g101 = vec3f(gx1.y, gy1.y, gz1.y);
  var g011 = vec3f(gx1.z, gy1.z, gz1.z);
  var g111 = vec3f(gx1.w, gy1.w, gz1.w);

  let norm0 = taylorInvSqrtVec4(vec4f(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  let norm1 = taylorInvSqrtVec4(vec4f(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  let n000 = dot(g000, Pf0);
  let n100 = dot(g100, vec3f(Pf1.x, Pf0.yz));
  let n010 = dot(g010, vec3f(Pf0.x, Pf1.y, Pf0.z));
  let n110 = dot(g110, vec3f(Pf1.xy, Pf0.z));
  let n001 = dot(g001, vec3f(Pf0.xy, Pf1.z));
  let n101 = dot(g101, vec3f(Pf1.x, Pf0.y, Pf1.z));
  let n011 = dot(g011, vec3f(Pf0.x, Pf1.yz));
  let n111 = dot(g111, Pf1);

  let fade_xyz = fadeVec3(Pf0);
  let n_z = mix(vec4f(n000, n100, n010, n110), vec4f(n001, n101, n011, n111), fade_xyz.z);
  let n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  let n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}

// 4D
// Classic Perlin noise
fn cnoiseVec4(P: vec4f) -> f32 {
  var Pi0 = floor(P); // Integer part for indexing
  var Pi1 = Pi0 + 1.0; // Integer part + 1
  Pi0 = mod289Vec4(Pi0);
  Pi1 = mod289Vec4(Pi1);
  let Pf0 = fract(P); // Fractional part for interpolation
  let Pf1 = Pf0 - 1.0; // Fractional part - 1.0
  let ix = vec4f(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  let iy = vec4f(Pi0.yy, Pi1.yy);
  let iz0 = vec4f(Pi0.zzzz);
  let iz1 = vec4f(Pi1.zzzz);
  let iw0 = vec4f(Pi0.wwww);
  let iw1 = vec4f(Pi1.wwww);

  let ixy = permuteVec4(permuteVec4(ix) + iy);
  let ixy0 = permuteVec4(ixy + iz0);
  let ixy1 = permuteVec4(ixy + iz1);
  let ixy00 = permuteVec4(ixy0 + iw0);
  let ixy01 = permuteVec4(ixy0 + iw1);
  let ixy10 = permuteVec4(ixy1 + iw0);
  let ixy11 = permuteVec4(ixy1 + iw1);

  var gx00 = ixy00 * (1.0 / 7.0);
  var gy00 = floor(gx00) * (1.0 / 7.0);
  var gz00 = floor(gy00) * (1.0 / 6.0);
  gx00 = fract(gx00) - 0.5;
  gy00 = fract(gy00) - 0.5;
  gz00 = fract(gz00) - 0.5;
  var gw00 = vec4f(0.75) - abs(gx00) - abs(gy00) - abs(gz00);
  let sw00 = step(gw00, vec4f(0.0));
  gx00 -= sw00 * (step(vec4f(0.0), gx00) - 0.5);
  gy00 -= sw00 * (step(vec4f(0.0), gy00) - 0.5);

  var gx01 = ixy01 * (1.0 / 7.0);
  var gy01 = floor(gx01) * (1.0 / 7.0);
  var gz01 = floor(gy01) * (1.0 / 6.0);
  gx01 = fract(gx01) - 0.5;
  gy01 = fract(gy01) - 0.5;
  gz01 = fract(gz01) - 0.5;
  var gw01 = vec4f(0.75) - abs(gx01) - abs(gy01) - abs(gz01);
  let sw01 = step(gw01, vec4f(0.0));
  gx01 -= sw01 * (step(vec4f(0.0), gx01) - 0.5);
  gy01 -= sw01 * (step(vec4f(0.0), gy01) - 0.5);

  var gx10 = ixy10 * (1.0 / 7.0);
  var gy10 = floor(gx10) * (1.0 / 7.0);
  var gz10 = floor(gy10) * (1.0 / 6.0);
  gx10 = fract(gx10) - 0.5;
  gy10 = fract(gy10) - 0.5;
  gz10 = fract(gz10) - 0.5;
  var gw10 = vec4f(0.75) - abs(gx10) - abs(gy10) - abs(gz10);
  let sw10 = step(gw10, vec4f(0.0));
  gx10 -= sw10 * (step(vec4f(0.0), gx10) - 0.5);
  gy10 -= sw10 * (step(vec4f(0.0), gy10) - 0.5);

  var gx11 = ixy11 * (1.0 / 7.0);
  var gy11 = floor(gx11) * (1.0 / 7.0);
  var gz11 = floor(gy11) * (1.0 / 6.0);
  gx11 = fract(gx11) - 0.5;
  gy11 = fract(gy11) - 0.5;
  gz11 = fract(gz11) - 0.5;
  var gw11 = vec4f(0.75) - abs(gx11) - abs(gy11) - abs(gz11);
  let sw11 = step(gw11, vec4f(0.0));
  gx11 -= sw11 * (step(vec4f(0.0), gx11) - 0.5);
  gy11 -= sw11 * (step(vec4f(0.0), gy11) - 0.5);

  var g0000 = vec4f(gx00.x, gy00.x, gz00.x, gw00.x);
  var g1000 = vec4f(gx00.y, gy00.y, gz00.y, gw00.y);
  var g0100 = vec4f(gx00.z, gy00.z, gz00.z, gw00.z);
  var g1100 = vec4f(gx00.w, gy00.w, gz00.w, gw00.w);
  var g0010 = vec4f(gx10.x, gy10.x, gz10.x, gw10.x);
  var g1010 = vec4f(gx10.y, gy10.y, gz10.y, gw10.y);
  var g0110 = vec4f(gx10.z, gy10.z, gz10.z, gw10.z);
  var g1110 = vec4f(gx10.w, gy10.w, gz10.w, gw10.w);
  var g0001 = vec4f(gx01.x, gy01.x, gz01.x, gw01.x);
  var g1001 = vec4f(gx01.y, gy01.y, gz01.y, gw01.y);
  var g0101 = vec4f(gx01.z, gy01.z, gz01.z, gw01.z);
  var g1101 = vec4f(gx01.w, gy01.w, gz01.w, gw01.w);
  var g0011 = vec4f(gx11.x, gy11.x, gz11.x, gw11.x);
  var g1011 = vec4f(gx11.y, gy11.y, gz11.y, gw11.y);
  var g0111 = vec4f(gx11.z, gy11.z, gz11.z, gw11.z);
  var g1111 = vec4f(gx11.w, gy11.w, gz11.w, gw11.w);

  let norm00 = taylorInvSqrtVec4(vec4f(dot(g0000, g0000), dot(g0100, g0100), dot(g1000, g1000), dot(g1100, g1100)));
  g0000 *= norm00.x;
  g0100 *= norm00.y;
  g1000 *= norm00.z;
  g1100 *= norm00.w;

  let norm01 = taylorInvSqrtVec4(vec4f(dot(g0001, g0001), dot(g0101, g0101), dot(g1001, g1001), dot(g1101, g1101)));
  g0001 *= norm01.x;
  g0101 *= norm01.y;
  g1001 *= norm01.z;
  g1101 *= norm01.w;

  let norm10 = taylorInvSqrtVec4(vec4f(dot(g0010, g0010), dot(g0110, g0110), dot(g1010, g1010), dot(g1110, g1110)));
  g0010 *= norm10.x;
  g0110 *= norm10.y;
  g1010 *= norm10.z;
  g1110 *= norm10.w;

  let norm11 = taylorInvSqrtVec4(vec4f(dot(g0011, g0011), dot(g0111, g0111), dot(g1011, g1011), dot(g1111, g1111)));
  g0011 *= norm11.x;
  g0111 *= norm11.y;
  g1011 *= norm11.z;
  g1111 *= norm11.w;

  let n0000 = dot(g0000, Pf0);
  let n1000 = dot(g1000, vec4f(Pf1.x, Pf0.yzw));
  let n0100 = dot(g0100, vec4f(Pf0.x, Pf1.y, Pf0.zw));
  let n1100 = dot(g1100, vec4f(Pf1.xy, Pf0.zw));
  let n0010 = dot(g0010, vec4f(Pf0.xy, Pf1.z, Pf0.w));
  let n1010 = dot(g1010, vec4f(Pf1.x, Pf0.y, Pf1.z, Pf0.w));
  let n0110 = dot(g0110, vec4f(Pf0.x, Pf1.yz, Pf0.w));
  let n1110 = dot(g1110, vec4f(Pf1.xyz, Pf0.w));
  let n0001 = dot(g0001, vec4f(Pf0.xyz, Pf1.w));
  let n1001 = dot(g1001, vec4f(Pf1.x, Pf0.yz, Pf1.w));
  let n0101 = dot(g0101, vec4f(Pf0.x, Pf1.y, Pf0.z, Pf1.w));
  let n1101 = dot(g1101, vec4f(Pf1.xy, Pf0.z, Pf1.w));
  let n0011 = dot(g0011, vec4f(Pf0.xy, Pf1.zw));
  let n1011 = dot(g1011, vec4f(Pf1.x, Pf0.y, Pf1.zw));
  let n0111 = dot(g0111, vec4f(Pf0.x, Pf1.yzw));
  let n1111 = dot(g1111, Pf1);

  let fade_xyzw = fadeVec4(Pf0);
  let n_0w = mix(vec4f(n0000, n1000, n0100, n1100), vec4f(n0001, n1001, n0101, n1101), fade_xyzw.w);
  let n_1w = mix(vec4f(n0010, n1010, n0110, n1110), vec4f(n0011, n1011, n0111, n1111), fade_xyzw.w);
  let n_zw = mix(n_0w, n_1w, fade_xyzw.z);
  let n_yzw = mix(n_zw.xy, n_zw.zw, fade_xyzw.y);
  let n_xyzw = mix(n_yzw.x, n_yzw.y, fade_xyzw.x);
  return 2.2 * n_xyzw;
}

// Classic Perlin noise, periodic version
fn pnoiseVec4(P: vec4f, rep: vec4f) -> f32 {
  var Pi0 = glslModVec4(floor(P), rep); // Integer part modulo rep
  var Pi1 = glslModVec4(Pi0 + 1.0, rep); // Integer part + 1 mod rep
  Pi0 = mod289Vec4(Pi0);
  Pi1 = mod289Vec4(Pi1);
  let Pf0 = fract(P); // Fractional part for interpolation
  let Pf1 = Pf0 - 1.0; // Fractional part - 1.0
  let ix = vec4f(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  let iy = vec4f(Pi0.yy, Pi1.yy);
  let iz0 = vec4f(Pi0.zzzz);
  let iz1 = vec4f(Pi1.zzzz);
  let iw0 = vec4f(Pi0.wwww);
  let iw1 = vec4f(Pi1.wwww);

  let ixy = permuteVec4(permuteVec4(ix) + iy);
  let ixy0 = permuteVec4(ixy + iz0);
  let ixy1 = permuteVec4(ixy + iz1);
  let ixy00 = permuteVec4(ixy0 + iw0);
  let ixy01 = permuteVec4(ixy0 + iw1);
  let ixy10 = permuteVec4(ixy1 + iw0);
  let ixy11 = permuteVec4(ixy1 + iw1);

  var gx00 = ixy00 * (1.0 / 7.0);
  var gy00 = floor(gx00) * (1.0 / 7.0);
  var gz00 = floor(gy00) * (1.0 / 6.0);
  gx00 = fract(gx00) - 0.5;
  gy00 = fract(gy00) - 0.5;
  gz00 = fract(gz00) - 0.5;
  var gw00 = vec4f(0.75) - abs(gx00) - abs(gy00) - abs(gz00);
  let sw00 = step(gw00, vec4f(0.0));
  gx00 -= sw00 * (step(vec4f(0.0), gx00) - 0.5);
  gy00 -= sw00 * (step(vec4f(0.0), gy00) - 0.5);

  var gx01 = ixy01 * (1.0 / 7.0);
  var gy01 = floor(gx01) * (1.0 / 7.0);
  var gz01 = floor(gy01) * (1.0 / 6.0);
  gx01 = fract(gx01) - 0.5;
  gy01 = fract(gy01) - 0.5;
  gz01 = fract(gz01) - 0.5;
  var gw01 = vec4f(0.75) - abs(gx01) - abs(gy01) - abs(gz01);
  let sw01 = step(gw01, vec4f(0.0));
  gx01 -= sw01 * (step(vec4f(0.0), gx01) - 0.5);
  gy01 -= sw01 * (step(vec4f(0.0), gy01) - 0.5);

  var gx10 = ixy10 * (1.0 / 7.0);
  var gy10 = floor(gx10) * (1.0 / 7.0);
  var gz10 = floor(gy10) * (1.0 / 6.0);
  gx10 = fract(gx10) - 0.5;
  gy10 = fract(gy10) - 0.5;
  gz10 = fract(gz10) - 0.5;
  var gw10 = vec4f(0.75) - abs(gx10) - abs(gy10) - abs(gz10);
  let sw10 = step(gw10, vec4f(0.0));
  gx10 -= sw10 * (step(vec4f(0.0), gx10) - 0.5);
  gy10 -= sw10 * (step(vec4f(0.0), gy10) - 0.5);

  var gx11 = ixy11 * (1.0 / 7.0);
  var gy11 = floor(gx11) * (1.0 / 7.0);
  var gz11 = floor(gy11) * (1.0 / 6.0);
  gx11 = fract(gx11) - 0.5;
  gy11 = fract(gy11) - 0.5;
  gz11 = fract(gz11) - 0.5;
  var gw11 = vec4f(0.75) - abs(gx11) - abs(gy11) - abs(gz11);
  let sw11 = step(gw11, vec4f(0.0));
  gx11 -= sw11 * (step(vec4f(0.0), gx11) - 0.5);
  gy11 -= sw11 * (step(vec4f(0.0), gy11) - 0.5);

  var g0000 = vec4f(gx00.x, gy00.x, gz00.x, gw00.x);
  var g1000 = vec4f(gx00.y, gy00.y, gz00.y, gw00.y);
  var g0100 = vec4f(gx00.z, gy00.z, gz00.z, gw00.z);
  var g1100 = vec4f(gx00.w, gy00.w, gz00.w, gw00.w);
  var g0010 = vec4f(gx10.x, gy10.x, gz10.x, gw10.x);
  var g1010 = vec4f(gx10.y, gy10.y, gz10.y, gw10.y);
  var g0110 = vec4f(gx10.z, gy10.z, gz10.z, gw10.z);
  var g1110 = vec4f(gx10.w, gy10.w, gz10.w, gw10.w);
  var g0001 = vec4f(gx01.x, gy01.x, gz01.x, gw01.x);
  var g1001 = vec4f(gx01.y, gy01.y, gz01.y, gw01.y);
  var g0101 = vec4f(gx01.z, gy01.z, gz01.z, gw01.z);
  var g1101 = vec4f(gx01.w, gy01.w, gz01.w, gw01.w);
  var g0011 = vec4f(gx11.x, gy11.x, gz11.x, gw11.x);
  var g1011 = vec4f(gx11.y, gy11.y, gz11.y, gw11.y);
  var g0111 = vec4f(gx11.z, gy11.z, gz11.z, gw11.z);
  var g1111 = vec4f(gx11.w, gy11.w, gz11.w, gw11.w);

  let norm00 = taylorInvSqrtVec4(vec4f(dot(g0000, g0000), dot(g0100, g0100), dot(g1000, g1000), dot(g1100, g1100)));
  g0000 *= norm00.x;
  g0100 *= norm00.y;
  g1000 *= norm00.z;
  g1100 *= norm00.w;

  let norm01 = taylorInvSqrtVec4(vec4f(dot(g0001, g0001), dot(g0101, g0101), dot(g1001, g1001), dot(g1101, g1101)));
  g0001 *= norm01.x;
  g0101 *= norm01.y;
  g1001 *= norm01.z;
  g1101 *= norm01.w;

  let norm10 = taylorInvSqrtVec4(vec4f(dot(g0010, g0010), dot(g0110, g0110), dot(g1010, g1010), dot(g1110, g1110)));
  g0010 *= norm10.x;
  g0110 *= norm10.y;
  g1010 *= norm10.z;
  g1110 *= norm10.w;

  let norm11 = taylorInvSqrtVec4(vec4f(dot(g0011, g0011), dot(g0111, g0111), dot(g1011, g1011), dot(g1111, g1111)));
  g0011 *= norm11.x;
  g0111 *= norm11.y;
  g1011 *= norm11.z;
  g1111 *= norm11.w;

  let n0000 = dot(g0000, Pf0);
  let n1000 = dot(g1000, vec4f(Pf1.x, Pf0.yzw));
  let n0100 = dot(g0100, vec4f(Pf0.x, Pf1.y, Pf0.zw));
  let n1100 = dot(g1100, vec4f(Pf1.xy, Pf0.zw));
  let n0010 = dot(g0010, vec4f(Pf0.xy, Pf1.z, Pf0.w));
  let n1010 = dot(g1010, vec4f(Pf1.x, Pf0.y, Pf1.z, Pf0.w));
  let n0110 = dot(g0110, vec4f(Pf0.x, Pf1.yz, Pf0.w));
  let n1110 = dot(g1110, vec4f(Pf1.xyz, Pf0.w));
  let n0001 = dot(g0001, vec4f(Pf0.xyz, Pf1.w));
  let n1001 = dot(g1001, vec4f(Pf1.x, Pf0.yz, Pf1.w));
  let n0101 = dot(g0101, vec4f(Pf0.x, Pf1.y, Pf0.z, Pf1.w));
  let n1101 = dot(g1101, vec4f(Pf1.xy, Pf0.z, Pf1.w));
  let n0011 = dot(g0011, vec4f(Pf0.xy, Pf1.zw));
  let n1011 = dot(g1011, vec4f(Pf1.x, Pf0.y, Pf1.zw));
  let n0111 = dot(g0111, vec4f(Pf0.x, Pf1.yzw));
  let n1111 = dot(g1111, Pf1);

  let fade_xyzw = fadeVec4(Pf0);
  let n_0w = mix(vec4f(n0000, n1000, n0100, n1100), vec4f(n0001, n1001, n0101, n1101), fade_xyzw.w);
  let n_1w = mix(vec4f(n0010, n1010, n0110, n1110), vec4f(n0011, n1011, n0111, n1111), fade_xyzw.w);
  let n_zw = mix(n_0w, n_1w, fade_xyzw.z);
  let n_yzw = mix(n_zw.xy, n_zw.zw, fade_xyzw.y);
  let n_xyzw = mix(n_yzw.x, n_yzw.y, fade_xyzw.x);
  return 2.2 * n_xyzw;
}
`;

const simplex = /* wgsl */ `
// 2D
fn snoiseVec2(v: vec2f) -> f32 {
  let C = vec4f(
    0.211324865405187,  // (3.0-sqrt(3.0))/6.0
    0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
    -0.577350269189626, // -1.0 + 2.0 * C.x
    0.024390243902439   // 1.0 / 41.0
  );

  // First corner
  var i  = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);

  // Other corners
  let i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
  // x0 = x0 - 0.0 + 0.0 * C.xx;
  // x1 = x0 - i1 + 1.0 * C.xx;
  // x2 = x0 - 1.0 + 2.0 * C.xx;
  var x12 = x0.xyxy + C.xxzz;
  x12 = vec4f(x12.xy - i1, x12.zw);

  // Permutations
  i = mod289Vec2(i); // Avoid truncation effects in permutation
  let p = permuteVec3(permuteVec3(i.y + vec3f(0.0, i1.y, 1.0)) + i.x + vec3f(0.0, i1.x, 1.0));

  var m = max(vec3f(0.5) - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3f(0.0));
  m = m * m;
  m = m * m;

  // Gradients: 41 points uniformly over a line, mapped onto a diamond.
  // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)
  let x = 2.0 * fract(p * C.www) - 1.0;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;

  // Normalise gradients implicitly by scaling m
  // Approximation of: m *= inversesqrt(a0*a0 + h*h);
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  // Compute final noise value at P
  var g: vec3f;
  g.x = a0.x * x0.x + h.x * x0.y;
  g = vec3f(g.x, a0.yz * x12.xz + h.yz * x12.yw);
  return 130.0 * dot(m, g);
}

// 3D
fn snoiseVec3(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);

  // First corner
  var i  = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);

  // Other corners
  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  let x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289Vec3(i);
  let p = permuteVec4(permuteVec4(permuteVec4(
    i.z + vec4f(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4f(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4f(0.0, i1.x, i2.x, 1.0));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  let n_ = 0.142857142857; // 1.0/7.0
  let ns = n_ * D.wyz - D.xzx;

  let j = p - 49.0 * floor(p * ns.z * ns.z); //  mod(p,7*7)

  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_); // mod(j,N)

  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);

  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);

  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));

  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;

  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);

  // Normalise gradients
  let norm = taylorInvSqrtVec4(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  var m = max(vec4f(0.5) - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 105.0 * dot(m * m, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// 4D
fn snoiseVec4(v: vec4f) -> f32 {
  let C = vec4f(
    0.138196601125011,  // (5 - sqrt(5))/20  G4
    0.276393202250021,  // 2 * G4
    0.414589803375032,  // 3 * G4
    -0.447213595499958  // -1 + 4 * G4
  );

  // First corner
  var i  = floor(v + dot(v, vec4f(F4)));
  let x0 = v - i + dot(i, C.xxxx);

  // Other corners
  // Rank sorting originally contributed by Bill Licea-Kane, AMD (formerly ATI)
  var i0: vec4f;
  let isX = step(x0.yzw, x0.xxx);
  let isYZ = step(x0.zww, x0.yyz);
  i0.x = isX.x + isX.y + isX.z;
  i0 = vec4f(i0.x, 1.0 - isX);
  i0.y += isYZ.x + isYZ.y;
  i0 = vec4f(i0.xy, i0.zw + (1.0 - isYZ.xy));
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;

  // i0 now contains the unique values 0,1,2,3 in each channel
  let i3 = clamp(i0, vec4f(0.0), vec4f(1.0));
  let i2 = clamp(i0 - 1.0, vec4f(0.0), vec4f(1.0));
  let i1 = clamp(i0 - 2.0, vec4f(0.0), vec4f(1.0));

  //  x0 = x0 - 0.0 + 0.0 * C.xxxx
  //  x1 = x0 - i1  + 1.0 * C.xxxx
  //  x2 = x0 - i2  + 2.0 * C.xxxx
  //  x3 = x0 - i3  + 3.0 * C.xxxx
  //  x4 = x0 - 1.0 + 4.0 * C.xxxx
  let x1 = x0 - i1 + C.xxxx;
  let x2 = x0 - i2 + C.yyyy;
  let x3 = x0 - i3 + C.zzzz;
  let x4 = x0 + C.wwww;

  // Permutations
  i = mod289Vec4(i);
  let j0 = permuteF32(permuteF32(permuteF32(permuteF32(i.w) + i.z) + i.y) + i.x);
  let j1 = permuteVec4(permuteVec4(permuteVec4(permuteVec4(
    i.w + vec4f(i1.w, i2.w, i3.w, 1.0))
    + i.z + vec4f(i1.z, i2.z, i3.z, 1.0))
    + i.y + vec4f(i1.y, i2.y, i3.y, 1.0))
    + i.x + vec4f(i1.x, i2.x, i3.x, 1.0));

  // Gradients: 7x7x6 points over a cube, mapped onto a 4-cross polytope
  // 7*7*6 = 294, which is close to the ring size 17*17 = 289.
  let ip = vec4f(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);

  var p0 = grad4(j0, ip);
  var p1 = grad4(j1.x, ip);
  var p2 = grad4(j1.y, ip);
  var p3 = grad4(j1.z, ip);
  var p4 = grad4(j1.w, ip);

  // Normalise gradients
  let norm = taylorInvSqrtVec4(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  p4 *= taylorInvSqrtF32(dot(p4, p4));

  // Mix contributions from the five corners
  var m0 = max(vec3f(0.6) - vec3f(dot(x0, x0), dot(x1, x1), dot(x2, x2)), vec3f(0.0));
  var m1 = max(vec2f(0.6) - vec2f(dot(x3, x3), dot(x4, x4)), vec2f(0.0));
  m0 = m0 * m0;
  m1 = m1 * m1;
  return 49.0 * (
    dot(m0 * m0, vec3f(dot(p0, x0), dot(p1, x1), dot(p2, x2)))
    + dot(m1 * m1, vec2f(dot(p3, x3), dot(p4, x4)))
  );
}
`;

export { common, perlin, simplex };
