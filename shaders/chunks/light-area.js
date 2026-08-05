// Real-Time Polygonal-Light Shading with Linearly Transformed Cosines.
// Eric Heitz, Jonathan Dupuy, Stephen Hill and David Neubelt.
// ACM Transactions on Graphics (Proceedings of ACM SIGGRAPH 2016) 35(4), 2016.
// Project page: https://eheitzresearch.wordpress.com/415-2/
export default /* wgsl */ `
struct AreaLight {
  position: vec3f,
  color: vec4f,
  rotation: vec4f,
  size: vec2f,
  disk: u32,
  doubleSided: u32,

  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f,
  castShadows: u32,
  near: f32,
  far: f32,
  radiusUV: vec2f,
  shadowMapSize: vec2f,
};

const clipless = false;
const groundTruth = false;

const LUT_SIZE: f32 = 64.0;
const LUT_SCALE: f32 = (LUT_SIZE - 1.0) / LUT_SIZE;
const LUT_BIAS: f32 = 0.5 / LUT_SIZE;

// Disk
const NUM_SAMPLES: i32 = 8;
const sampleCount: i32 = 4;
const pi: f32 = 3.14159265;
const NO_HIT: f32 = 1e9;

struct Ray {
  origin: vec3f,
  dir: vec3f,
};

struct Disk {
  center: vec3f,
  dirx: vec3f,
  diry: vec3f,
  halfx: f32,
  halfy: f32,

  plane: vec4f,
};

fn RayPlaneIntersect(ray: Ray, plane: vec4f) -> f32 {
  let t = -dot(plane, vec4f(ray.origin, 1.0)) / dot(plane.xyz, ray.dir);
  return select(NO_HIT, t, t > 0.0);
}

fn sqr(x: f32) -> f32 {
  return x * x;
}

fn RayDiskIntersect(ray: Ray, disk: Disk) -> f32 {
  var t = RayPlaneIntersect(ray, disk.plane);
  if (t != NO_HIT) {
    let pos = ray.origin + ray.dir * t;
    let lpos = pos - disk.center;

    let x = dot(lpos, disk.dirx);
    let y = dot(lpos, disk.diry);

    if (sqr(x / disk.halfx) + sqr(y / disk.halfy) > 1.0) {
      t = NO_HIT;
    }
  }

  return t;
}

fn mat3_from_columns(c0: vec3f, c1: vec3f, c2: vec3f) -> mat3x3f {
  return mat3x3f(c0, c1, c2);
}

fn Halton(index: i32, base: f32) -> f32 {
  var result = 0.0;
  var f = 1.0 / base;
  var i = f32(index);
  for (var x = 0; x < 8; x++) {
    if (i <= 0.0) {
      break;
    }

    result += f * glslModF32(i, base);
    i = floor(i / base);
    f = f / base;
  }

  return result;
}

fn Halton2D(s: ptr<function, array<vec2f, 8>>, offset: i32) {
  for (var i = 0; i < NUM_SAMPLES; i++) {
    (*s)[i].x = Halton(i + offset, 2.0);
    (*s)[i].y = Halton(i + offset, 3.0);
  }
}

fn InitDisk(center: vec3f, dirx: vec3f, diry: vec3f, halfx: f32, halfy: f32) -> Disk {
  var disk: Disk;

  disk.center = center;
  disk.dirx = dirx;
  disk.diry = diry;
  disk.halfx = halfx;
  disk.halfy = halfy;

  let diskNormal = cross(disk.dirx, disk.diry);
  disk.plane = vec4f(diskNormal, -dot(diskNormal, disk.center));

  return disk;
}

// An extended version of the implementation from
// "How to solve a cubic equation, revisited"
// http://momentsingraphics.de/?p=105
fn SolveCubic(coefficientIn: vec4f) -> vec3f {
  var Coefficient = coefficientIn;
  // Normalize the polynomial
  Coefficient = vec4f(Coefficient.xyz / Coefficient.w, Coefficient.w);
  // Divide middle coefficients by three
  Coefficient = vec4f(Coefficient.x, Coefficient.yz / 3.0, Coefficient.w);

  let A = Coefficient.w;
  let B = Coefficient.z;
  let C = Coefficient.y;
  let D = Coefficient.x;

  // Compute the Hessian and the discriminant
  let Delta = vec3f(
    -Coefficient.z * Coefficient.z + Coefficient.y,
    -Coefficient.y * Coefficient.z + Coefficient.x,
    dot(vec2f(Coefficient.z, -Coefficient.y), Coefficient.xy)
  );

  let Discriminant = dot(vec2f(4.0 * Delta.x, -Delta.y), Delta.zy);

  var xlc: vec2f;
  var xsc: vec2f;

  // Algorithm A
  {
    let C_a = Delta.x;
    let D_a = -2.0 * B * Delta.x + Delta.y;

    // Take the cubic root of a normalized complex number
    let Theta = atan2(sqrt(Discriminant), -D_a) / 3.0;

    let x_1a = 2.0 * sqrt(-C_a) * cos(Theta);
    let x_3a = 2.0 * sqrt(-C_a) * cos(Theta + (2.0 / 3.0) * pi);

    let xl = select(x_3a, x_1a, (x_1a + x_3a) > 2.0 * B);

    xlc = vec2f(xl - B, A);
  }

  // Algorithm D
  {
    let C_d = Delta.z;
    let D_d = -D * Delta.y + 2.0 * C * Delta.z;

    // Take the cubic root of a normalized complex number
    let Theta = atan2(D * sqrt(Discriminant), -D_d) / 3.0;

    let x_1d = 2.0 * sqrt(-C_d) * cos(Theta);
    let x_3d = 2.0 * sqrt(-C_d) * cos(Theta + (2.0 / 3.0) * pi);

    let xs = select(x_3d, x_1d, x_1d + x_3d < 2.0 * C);

    xsc = vec2f(-D, xs + C);
  }

  let E = xlc.y * xsc.y;
  let F = -xlc.x * xsc.y - xlc.y * xsc.x;
  let G = xlc.x * xsc.x;

  let xmc = vec2f(C * F - B * G, -B * F + C * E);

  var Root = vec3f(xsc.x / xsc.y, xmc.x / xmc.y, xlc.x / xlc.y);

  if (Root.x < Root.y && Root.x < Root.z) {
    Root = Root.yxz;
  } else if (Root.z < Root.x && Root.z < Root.y) {
    Root = Root.xzy;
  }

  return Root;
}

fn LTC_EvaluateDisk(
  N: vec3f,
  V: vec3f,
  P: vec3f,
  Minv: mat3x3f,
  points: array<vec3f, 4>,
  twoSided: bool,
  u1: f32,
  u2: f32,
  ltc2: texture_2d<f32>,
  ltc2Sampler: sampler
) -> vec3f {
  // construct orthonormal basis around N
  let T1 = normalize(V - N * dot(V, N));
  let T2 = cross(N, T1);

  // rotate area light in (T1, T2, N) basis
  let R = transpose(mat3x3f(T1, T2, N));

  // polygon (allocate 5 vertices for clipping)
  var L_: array<vec3f, 3>;
  L_[0] = R * (points[0] - P);
  L_[1] = R * (points[1] - P);
  L_[2] = R * (points[2] - P);

  var Lo_i = vec3f(0.0);

  // init ellipse
  var C = 0.5 * (L_[0] + L_[2]);
  var V1 = 0.5 * (L_[1] - L_[2]);
  var V2 = 0.5 * (L_[1] - L_[0]);

  C = Minv * C;
  V1 = Minv * V1;
  V2 = Minv * V2;

  if (!twoSided && dot(cross(V1, V2), C) < 0.0) {
    return vec3f(0.0);
  }

  // compute eigenvectors of ellipse
  var a: f32;
  var b: f32;
  let d11 = dot(V1, V1);
  let d22 = dot(V2, V2);
  let d12 = dot(V1, V2);
  if (abs(d12) / sqrt(d11 * d22) > 0.0001) {
    let tr = d11 + d22;
    var det = -d12 * d12 + d11 * d22;

    // use sqrt matrix to solve for eigenvalues
    det = sqrt(det);
    let u = 0.5 * sqrt(tr - 2.0 * det);
    let v = 0.5 * sqrt(tr + 2.0 * det);
    let e_max = sqr(u + v);
    let e_min = sqr(u - v);

    var V1_: vec3f;
    var V2_: vec3f;

    if (d11 > d22) {
      V1_ = d12 * V1 + (e_max - d11) * V2;
      V2_ = d12 * V1 + (e_min - d11) * V2;
    } else {
      V1_ = d12 * V2 + (e_max - d22) * V1;
      V2_ = d12 * V2 + (e_min - d22) * V1;
    }

    a = 1.0 / e_max;
    b = 1.0 / e_min;
    V1 = normalize(V1_);
    V2 = normalize(V2_);
  } else {
    a = 1.0 / dot(V1, V1);
    b = 1.0 / dot(V2, V2);
    V1 *= sqrt(a);
    V2 *= sqrt(b);
  }

  var V3 = cross(V1, V2);
  if (dot(C, V3) < 0.0) {
    V3 *= -1.0;
  }

  let L = dot(V3, C);
  let x0 = dot(V1, C) / L;
  let y0 = dot(V2, C) / L;

  let E1 = inverseSqrt(a);
  let E2 = inverseSqrt(b);

  a *= L * L;
  b *= L * L;

  let c0 = a * b;
  let c1 = a * b * (1.0 + x0 * x0 + y0 * y0) - a - b;
  let c2 = 1.0 - a * (1.0 + x0 * x0) - b * (1.0 + y0 * y0);
  let c3 = 1.0;

  let roots = SolveCubic(vec4f(c0, c1, c2, c3));
  let e1 = roots.x;
  let e2 = roots.y;
  let e3 = roots.z;

  var avgDir = vec3f(a * x0 / (a - e2), b * y0 / (b - e2), 1.0);

  let rotate = mat3_from_columns(V1, V2, V3);

  avgDir = rotate * avgDir;
  avgDir = normalize(avgDir);

  let L1 = sqrt(-e2 / e3);
  let L2 = sqrt(-e2 / e1);

  let formFactor = L1 * L2 * inverseSqrt((1.0 + L1 * L1) * (1.0 + L2 * L2));

  // use tabulated horizon-clipped sphere
  var uv = vec2f(avgDir.z * 0.5 + 0.5, formFactor);
  uv = uv * LUT_SCALE + LUT_BIAS;
  let scale = textureSampleLevel(ltc2, ltc2Sampler, uv, 0.0).w;

  var spec = formFactor * scale;

  if (groundTruth) {
    spec = 0.0;

    let diskArea = pi * E1 * E2;

    // light sample
    {
      // random point on ellipse
      let rad = sqrt(u1);
      let phi = 2.0 * pi * u2;
      let x = E1 * rad * cos(phi);
      let y = E2 * rad * sin(phi);

      let p = x * V1 + y * V2 + C;
      let v = normalize(p);

      let c2_ = max(dot(V3, v), 0.0);
      let solidAngle = max(c2_ / dot(p, p), 1e-7);
      let pdfLight = 1.0 / solidAngle / diskArea;

      let cosTheta = max(v.z, 0.0);
      let brdf = 1.0 / pi;
      let pdfBRDF = cosTheta / pi;

      if (cosTheta > 0.0) {
        spec += brdf * cosTheta / (pdfBRDF + pdfLight);
      }
    }

    // BRDF sample
    {
      // generate a cosine-distributed direction
      let rad = sqrt(u1);
      let phi = 2.0 * pi * u2;
      let x = rad * cos(phi);
      let y = rad * sin(phi);
      let dir = vec3f(x, y, sqrt(1.0 - u1));

      var ray: Ray;
      ray.origin = vec3f(0.0, 0.0, 0.0);
      ray.dir = dir;

      var disk = InitDisk(C, V1, V2, E1, E2);

      let diskNormal = V3;
      disk.plane = vec4f(diskNormal, -dot(diskNormal, disk.center));

      let distToDisk = RayDiskIntersect(ray, disk);
      let intersect = distToDisk != NO_HIT;

      let cosTheta = max(dir.z, 0.0);
      let brdf = 1.0 / pi;
      let pdfBRDF = cosTheta / pi;

      var pdfLight = 0.0;
      if (intersect) {
        let p = distToDisk * ray.dir;
        let v = normalize(p);
        let c2_ = max(dot(V3, v), 0.0);
        let solidAngle = max(c2_ / dot(p, p), 1e-7);
        pdfLight = 1.0 / solidAngle / diskArea;
      }

      if (intersect) {
        spec += brdf * cosTheta / (pdfBRDF + pdfLight);
      }
    }
  }

  Lo_i = vec3f(spec, spec, spec);

  return Lo_i;
}

// Quad
fn IntegrateEdgeVec(v1: vec3f, v2: vec3f) -> vec3f {
  let x = dot(v1, v2);
  let y = abs(x);

  let a = 0.8543985 + (0.4965155 + 0.0145206 * y) * y;
  let b = 3.4175940 + (4.1616724 + y) * y;
  let v = a / b;

  let theta_sintheta = select(0.5 * inverseSqrt(max(1.0 - x * x, 1e-7)) - v, v, x > 0.0);

  return cross(v1, v2) * theta_sintheta;
}

fn IntegrateEdge(v1: vec3f, v2: vec3f) -> f32 {
  return IntegrateEdgeVec(v1, v2).z;
}

fn ClipQuadToHorizon(L: ptr<function, array<vec3f, 5>>, n: ptr<function, i32>) {
  // detect clipping config
  var config = 0;
  if ((*L)[0].z > 0.0) { config += 1; }
  if ((*L)[1].z > 0.0) { config += 2; }
  if ((*L)[2].z > 0.0) { config += 4; }
  if ((*L)[3].z > 0.0) { config += 8; }

  // clip
  *n = 0;

  if (config == 0) {
    // clip all
  } else if (config == 1) { // V1 clip V2 V3 V4
    *n = 3;
    (*L)[1] = -(*L)[1].z * (*L)[0] + (*L)[0].z * (*L)[1];
    (*L)[2] = -(*L)[3].z * (*L)[0] + (*L)[0].z * (*L)[3];
  } else if (config == 2) { // V2 clip V1 V3 V4
    *n = 3;
    (*L)[0] = -(*L)[0].z * (*L)[1] + (*L)[1].z * (*L)[0];
    (*L)[2] = -(*L)[2].z * (*L)[1] + (*L)[1].z * (*L)[2];
  } else if (config == 3) { // V1 V2 clip V3 V4
    *n = 4;
    (*L)[2] = -(*L)[2].z * (*L)[1] + (*L)[1].z * (*L)[2];
    (*L)[3] = -(*L)[3].z * (*L)[0] + (*L)[0].z * (*L)[3];
  } else if (config == 4) { // V3 clip V1 V2 V4
    *n = 3;
    (*L)[0] = -(*L)[3].z * (*L)[2] + (*L)[2].z * (*L)[3];
    (*L)[1] = -(*L)[1].z * (*L)[2] + (*L)[2].z * (*L)[1];
  } else if (config == 5) { // V1 V3 clip V2 V4) impossible
    *n = 0;
  } else if (config == 6) { // V2 V3 clip V1 V4
    *n = 4;
    (*L)[0] = -(*L)[0].z * (*L)[1] + (*L)[1].z * (*L)[0];
    (*L)[3] = -(*L)[3].z * (*L)[2] + (*L)[2].z * (*L)[3];
  } else if (config == 7) { // V1 V2 V3 clip V4
    *n = 5;
    (*L)[4] = -(*L)[3].z * (*L)[0] + (*L)[0].z * (*L)[3];
    (*L)[3] = -(*L)[3].z * (*L)[2] + (*L)[2].z * (*L)[3];
  } else if (config == 8) { // V4 clip V1 V2 V3
    *n = 3;
    (*L)[0] = -(*L)[0].z * (*L)[3] + (*L)[3].z * (*L)[0];
    (*L)[1] = -(*L)[2].z * (*L)[3] + (*L)[3].z * (*L)[2];
    (*L)[2] = (*L)[3];
  } else if (config == 9) { // V1 V4 clip V2 V3
    *n = 4;
    (*L)[1] = -(*L)[1].z * (*L)[0] + (*L)[0].z * (*L)[1];
    (*L)[2] = -(*L)[2].z * (*L)[3] + (*L)[3].z * (*L)[2];
  } else if (config == 10) { // V2 V4 clip V1 V3) impossible
    *n = 0;
  } else if (config == 11) { // V1 V2 V4 clip V3
    *n = 5;
    (*L)[4] = (*L)[3];
    (*L)[3] = -(*L)[2].z * (*L)[3] + (*L)[3].z * (*L)[2];
    (*L)[2] = -(*L)[2].z * (*L)[1] + (*L)[1].z * (*L)[2];
  } else if (config == 12) { // V3 V4 clip V1 V2
    *n = 4;
    (*L)[1] = -(*L)[1].z * (*L)[2] + (*L)[2].z * (*L)[1];
    (*L)[0] = -(*L)[0].z * (*L)[3] + (*L)[3].z * (*L)[0];
  } else if (config == 13) { // V1 V3 V4 clip V2
    *n = 5;
    (*L)[4] = (*L)[3];
    (*L)[3] = (*L)[2];
    (*L)[2] = -(*L)[1].z * (*L)[2] + (*L)[2].z * (*L)[1];
    (*L)[1] = -(*L)[1].z * (*L)[0] + (*L)[0].z * (*L)[1];
  } else if (config == 14) { // V2 V3 V4 clip V1
    *n = 5;
    (*L)[4] = -(*L)[0].z * (*L)[3] + (*L)[3].z * (*L)[0];
    (*L)[0] = -(*L)[0].z * (*L)[1] + (*L)[1].z * (*L)[0];
  } else if (config == 15) { // V1 V2 V3 V4
    *n = 4;
  }

  if (*n == 3) {
    (*L)[3] = (*L)[0];
  }
  if (*n == 4) {
    (*L)[4] = (*L)[0];
  }
}

fn LTC_EvaluateQuad(
  N: vec3f,
  V: vec3f,
  P: vec3f,
  MinvIn: mat3x3f,
  points: array<vec3f, 4>,
  twoSided: bool,
  ltc2: texture_2d<f32>,
  ltc2Sampler: sampler
) -> vec3f {
  // construct orthonormal basis around N
  let T1 = normalize(V - N * dot(V, N));
  let T2 = cross(N, T1);

  // rotate area light in (T1, T2, N) basis
  var Minv = MinvIn * transpose(mat3x3f(T1, T2, N));

  // polygon (allocate 5 vertices for clipping)
  var L: array<vec3f, 5>;
  L[0] = Minv * (points[0] - P);
  L[1] = Minv * (points[1] - P);
  L[2] = Minv * (points[2] - P);
  L[3] = Minv * (points[3] - P);

  // integrate
  var sum = 0.0;

  if (clipless) {
    let dir = points[0].xyz - P;
    let lightNormal = cross(points[1] - points[0], points[3] - points[0]);
    let behind = dot(dir, lightNormal) < 0.0;

    L[0] = normalize(L[0]);
    L[1] = normalize(L[1]);
    L[2] = normalize(L[2]);
    L[3] = normalize(L[3]);

    var vsum = vec3f(0.0);

    vsum += IntegrateEdgeVec(L[0], L[1]);
    vsum += IntegrateEdgeVec(L[1], L[2]);
    vsum += IntegrateEdgeVec(L[2], L[3]);
    vsum += IntegrateEdgeVec(L[3], L[0]);

    let len = length(vsum);
    var z = vsum.z / len;

    if (behind) {
      z = -z;
    }

    var uv = vec2f(z * 0.5 + 0.5, len);
    uv = uv * LUT_SCALE + LUT_BIAS;

    let scale = textureSampleLevel(ltc2, ltc2Sampler, uv, 0.0).w;

    sum = len * scale;

    if (behind && !twoSided) {
      sum = 0.0;
    }
  } else {
    var n = 0;
    ClipQuadToHorizon(&L, &n);

    if (n == 0) {
      return vec3f(0.0, 0.0, 0.0);
    }
    // project onto sphere
    L[0] = normalize(L[0]);
    L[1] = normalize(L[1]);
    L[2] = normalize(L[2]);
    L[3] = normalize(L[3]);
    L[4] = normalize(L[4]);

    // integrate
    sum += IntegrateEdge(L[0], L[1]);
    sum += IntegrateEdge(L[1], L[2]);
    sum += IntegrateEdge(L[2], L[3]);
    if (n >= 4) {
      sum += IntegrateEdge(L[3], L[4]);
    }
    if (n == 5) {
      sum += IntegrateEdge(L[4], L[0]);
    }

    sum = select(max(0.0, sum), abs(sum), twoSided);
  }

  let Lo_i = vec3f(sum, sum, sum);

  return Lo_i;
}

fn EvaluateAreaLight(
  data: ptr<function, PBRData>,
  light: AreaLight,
  shadowMap: texture_depth_2d,
  shadowMapSampler: sampler_comparison,
  ltc1: texture_2d<f32>,
  ltc1Sampler: sampler,
  ltc2: texture_2d<f32>,
  ltc2Sampler: sampler,
  ao: f32,
  positionWorld: vec3f,
  cameraPosition: vec3f,
  fragCoord: vec2f
) {
  let lightViewPosition = light.viewMatrix * vec4f(positionWorld, 1.0);
  let lightDeviceCoordsPosition = light.projectionMatrix * lightViewPosition;
  let lightDeviceCoordsPositionNormalized = lightDeviceCoordsPosition.xyz / lightDeviceCoordsPosition.w;
  // WebGPU texture origin is top-left, so flip v relative to clip space.
  let lightUV = vec2f(
    lightDeviceCoordsPositionNormalized.x * 0.5 + 0.5,
    0.5 - lightDeviceCoordsPositionNormalized.y * 0.5,
  );
  // Computed here (uniform control flow) so the receiver-plane bias can use
  // screen-space derivatives; the shadow lookup below is behind a branch.
  let dzDuv = depthGradient(lightUV, lightDeviceCoordsPositionNormalized.z);

  var illuminated = 1.0;
  if (light.castShadows != 0u) {
    illuminated = getShadow(
      shadowMap,
      shadowMapSampler,
      light.shadowMapSize,
      lightUV,
      lightDeviceCoordsPositionNormalized.z,
      light.near,
      light.far,
      light.radiusUV,
      dzDuv,
      false,
      fragCoord
    );
  }

  if (illuminated > 0.0) {
    let pos = data.positionWorld;
    let N = data.normalWorld;
    let V = -normalize(pos - cameraPosition);
    let roughness = data.roughness;

    let ex = multQuat(vec3f(1.0, 0.0, 0.0), light.rotation) * light.size.x;
    let ey = multQuat(vec3f(0.0, 1.0, 0.0), light.rotation) * light.size.y;

    var points: array<vec3f, 4>;
    points[0] = light.position - ex + ey;
    points[1] = light.position + ex + ey;
    points[2] = light.position + ex - ey;
    points[3] = light.position - ex - ey;

    var u1 = 0.0;
    var u2 = 0.0;
    if (light.disk != 0u) {
      var seq: array<vec2f, 8>;
      Halton2D(&seq, sampleCount);

      u1 = rand(fragCoord * 0.01);
      u2 = rand(fragCoord.yx * 0.01);

      u1 = fract(u1 + seq[0].x);
      u2 = fract(u2 + seq[0].y);
    }

    let ndotv = saturateF32(dot(N, V));
    var uv = vec2f(roughness, sqrt(1.0 - ndotv));
    uv = uv * LUT_SCALE + LUT_BIAS;

    let t1 = textureSampleLevel(ltc1, ltc1Sampler, uv, 0.0);
    let t2 = textureSampleLevel(ltc2, ltc2Sampler, uv, 0.0);

    let Minv = mat3x3f(
      vec3f(t1.x, 0.0, t1.y),
      vec3f(0.0, 1.0, 0.0),
      vec3f(t1.z, 0.0, t1.w)
    );

    let doubleSided = light.doubleSided != 0u;

    var spec: vec3f;
    if (light.disk != 0u) {
      spec = LTC_EvaluateDisk(N, V, pos, Minv, points, doubleSided, u1, u2, ltc2, ltc2Sampler);
    } else {
      spec = LTC_EvaluateQuad(N, V, pos, Minv, points, doubleSided, ltc2, ltc2Sampler);
    }
    spec *= data.f0 * t2.x + (1.0 - data.f0) * t2.y;

    let identity = mat3x3f(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
    var diff: vec3f;
    if (light.disk != 0u) {
      diff = LTC_EvaluateDisk(N, V, pos, identity, points, doubleSided, u1, u2, ltc2, ltc2Sampler);
    } else {
      diff = LTC_EvaluateQuad(N, V, pos, identity, points, doubleSided, ltc2, ltc2Sampler);
    }

    spec = max(spec, vec3f(0.0));
    diff = max(diff, vec3f(0.0));

    diff *= (1.0 - data.transmission);

    let lightColor = decode(light.color, SRGB).xyz;
    data.directColor += illuminated * ao * lightColor * data.baseColor * diff;
    data.indirectSpecular += illuminated * ao * lightColor * spec;
  }
}
`;
