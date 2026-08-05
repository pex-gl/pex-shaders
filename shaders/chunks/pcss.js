// Percentage-Closer Soft Shadows (PCSS)
// Papers:
// - https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf
// - https://www.gamedevs.org/uploads/advanced-soft-shadow-mapping-techniques.pdf
//
// Depth-texture variant: the blocker search reads raw depth (textureLoad for 2D,
// textureSampleLevel for cubes) and the penumbra filter uses the comparison
// sampler (2D) or manual compare (cube). Depth bias is applied by the shadow
// pass rasterizer (slope-scaled), so no shader-side slope bias is needed here.
const PCSSCommon = /* wgsl */ `
override PCSS_BLOCKER_SEARCH_NUM_SAMPLES: i32 = 25;
override PCSS_PCF_NUM_SAMPLES: i32 = 64;

fn interleavedGradientNoise(fragCoord: vec2f) -> f32 {
  let magic = vec3f(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(fragCoord, magic.xy)));
}

// Vogel disk sample on the unit disk: a golden-angle spiral that stays evenly
// distributed for ANY sample count. A fixed table only distributes evenly at its
// full length, so a shorter blocker search (first N of a longer table) clusters
// toward the centre and never reaches the disk edge — under-sampling the wide
// search footprint of a perspective light and biasing the blocker average.
// "phase" rotates the whole spiral; feeding it per-pixel noise decorrelates
// neighbours so the kernel dithers instead of banding.
fn vogelDiskSample(i: i32, count: i32, phase: f32) -> vec2f {
  let GOLDEN_ANGLE = 2.399963229728653;
  let radius = sqrt((f32(i) + 0.5) / f32(count));
  let theta = f32(i) * GOLDEN_ANGLE + phase;
  return vec2f(radius * cos(theta), radius * sin(theta));
}

// Receiver-plane depth bias: solve d(depth)/d(uv) from screen-space derivatives
// of the light-space (uv, depth), so the shadow compare tracks the receiver's
// own slope across the filter kernel. Without it a surface tilted in light space
// self-shadows (its up-slope neighbours read as occluders). Must be called in
// uniform control flow (uses derivatives). Shadow Mapping: GPU-based Tips and
// Techniques, p41.
fn depthGradient(uv: vec2f, z: f32) -> vec2f {
  let dx = vec3f(dpdx(uv), dpdx(z));
  let dy = vec3f(dpdy(uv), dpdy(z));
  let det = dx.x * dy.y - dx.y * dy.x;
  if (abs(det) < 1e-8) {
    return vec2f(0.0);
  }
  return vec2f(
    dy.y * dx.z - dx.y * dy.z,
    dx.x * dy.z - dy.x * dx.z,
  ) / det;
}
`;

const PCSS = /* wgsl */ `
fn PCSSFindBlocker2D(
  depths: texture_depth_2d,
  size: vec2f,
  uv: vec2f,
  compare: f32,
  near: f32,
  far: f32,
  ortho: bool,
  searchWidthUV: vec2f,
  dzDuv: vec2f,
  phase: f32,
  blockerSum: ptr<function, f32>,
  numBlockers: ptr<function, f32>
) {
  let maxCoord = size - vec2f(1.0);
  for (var i = 0; i < PCSS_BLOCKER_SEARCH_NUM_SAMPLES; i++) {
    let offset = vogelDiskSample(i, PCSS_BLOCKER_SEARCH_NUM_SAMPLES, phase) * searchWidthUV;
    let coord = vec2i(clamp((uv + offset) * size, vec2f(0.0), maxCoord));
    let depth = textureLoad(depths, coord, 0);
    // Receiver-plane bias, clamped so it can only tighten the test (min(0, ·)): a
    // depth bias must reject self-shadowing, never accept more occluders. The
    // unclamped form runs past the far plane on the down-slope side of a large
    // perspective search and counts the background as a blocker, collapsing the
    // penumbra to a hard edge.
    if (depth < compare + min(0.0, dot(dzDuv, offset))) {
      *blockerSum += linearizeDepthZO(depth, near, far, ortho);
      *numBlockers += 1.0;
    }
  }
}

fn PCSSPCFFilter2D(
  depths: texture_depth_2d,
  depthSampler: sampler_comparison,
  uv: vec2f,
  compare: f32,
  dzDuv: vec2f,
  phase: f32,
  filterRadiusUV: vec2f
) -> f32 {
  var result = 0.0;
  for (var i = 0; i < PCSS_PCF_NUM_SAMPLES; i++) {
    let offset = vogelDiskSample(i, PCSS_PCF_NUM_SAMPLES, phase) * filterRadiusUV;
    // One-sided receiver-plane bias (see PCSSFindBlocker2D): only cancel up-slope
    // self-shadowing, never darken the down-slope side or the background.
    result += texture2DCompare(depths, depthSampler, uv + offset, compare + min(0.0, dot(dzDuv, offset)));
  }
  return result / f32(PCSS_PCF_NUM_SAMPLES);
}

fn PCSS(
  depths: texture_depth_2d,
  depthSampler: sampler_comparison,
  size: vec2f,
  uv: vec2f,
  compare: f32,
  near: f32,
  far: f32,
  radiusUV: vec2f,
  dzDuv: vec2f,
  ortho: bool,
  fragCoord: vec2f
) -> f32 {
  // Per-pixel rotation of the sampling spiral: decorrelates neighbours so the
  // penumbra dithers rather than bands.
  let phase = interleavedGradientNoise(fragCoord) * TWO_PI;

  // PCSS works in linear eye-space distance from the light (the paper's z).
  let receiverDepth = linearizeDepthZO(compare, near, far, ortho);

  // STEP 1: blocker search (raw depth). The search region is the light's
  // footprint on the shadow map: constant for a parallel (orthographic) light,
  // foreshortened by distance for a perspective one.
  let searchWidthUV = select(
    radiusUV * (receiverDepth - near) / receiverDepth,
    radiusUV,
    ortho,
  );
  var blockerSum = 0.0;
  var numBlockers = 0.0;
  PCSSFindBlocker2D(depths, size, uv, compare, near, far, ortho, searchWidthUV, dzDuv, phase, &blockerSum, &numBlockers);

  // No occluders: fully lit (avoids division by zero).
  if (numBlockers == 0.0) {
    return 1.0;
  }
  let avgBlockerDepth = blockerSum / numBlockers;

  // STEP 2: penumbra size. The blocker→receiver separation drives the softness.
  let separation = max(receiverDepth - avgBlockerDepth, 0.0);
  var filterRadiusUV: vec2f;
  if (ortho) {
    // Parallel light (sun): the penumbra grows linearly with separation at a
    // constant rate set by the light's angular size. Normalizing by frustum depth
    // keeps softness independent of the (auto-fit) shadow camera placement, and
    // avoids the distance-to-apex division that only applies to perspective.
    filterRadiusUV = (separation / max(far - near, 1e-4)) * radiusUV;
  } else {
    // Perspective light: NVIDIA PCSS — similar triangles about the apex, projected
    // to the near plane where radiusUV is measured.
    let penumbra = separation / max(avgBlockerDepth, 1e-4);
    filterRadiusUV = penumbra * radiusUV * (near / receiverDepth);
  }

  // STEP 3: PCF filtering (hardware comparison)
  return PCSSPCFFilter2D(depths, depthSampler, uv, compare, dzDuv, phase, filterRadiusUV);
}
`;

const PCSSCube = /* wgsl */ `
fn PCSSFindBlockerCube(
  depths: texture_depth_cube,
  depthSampler: sampler,
  dir: vec3f,
  T: vec3f,
  B: vec3f,
  compare: f32,
  searchWidth: f32,
  phase: f32,
  blockerSum: ptr<function, f32>,
  numBlockers: ptr<function, f32>
) {
  for (var i = 0; i < PCSS_BLOCKER_SEARCH_NUM_SAMPLES; i++) {
    let r = vogelDiskSample(i, PCSS_BLOCKER_SEARCH_NUM_SAMPLES, phase);
    let offset = (r.x * T + r.y * B) * searchWidth;
    let depth = textureSampleLevel(depths, depthSampler, normalize(dir + offset), 0);
    if (depth < compare) {
      *blockerSum += depth;
      *numBlockers += 1.0;
    }
  }
}

fn PCSSPCFFilterCube(
  depths: texture_depth_cube,
  depthSampler: sampler,
  dir: vec3f,
  T: vec3f,
  B: vec3f,
  compare: f32,
  phase: f32,
  filterRadius: f32
) -> f32 {
  var result = 0.0;
  for (var i = 0; i < PCSS_PCF_NUM_SAMPLES; i++) {
    let r = vogelDiskSample(i, PCSS_PCF_NUM_SAMPLES, phase);
    let offset = (r.x * T + r.y * B) * filterRadius;
    result += textureCubeCompare(depths, depthSampler, normalize(dir + offset), compare);
  }
  return result / f32(PCSS_PCF_NUM_SAMPLES);
}

fn PCSSCube(
  depths: texture_depth_cube,
  depthSampler: sampler,
  direction: vec3f,
  compare: f32,
  radius: f32,
  far: f32,
  fragCoord: vec2f
) -> f32 {
  let phase = interleavedGradientNoise(fragCoord) * TWO_PI;
  let dir = normalize(direction);

  // Tangent basis perpendicular to the sampling direction so the disk offsets stay
  // tangent to the cube regardless of the face being sampled.
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(dir.y) > 0.999);
  let T = normalize(cross(up, dir));
  let B = cross(dir, T);

  // Angular size of the light disk as seen from the receiver (world radius over
  // distance); compare is the receiver's radial distance normalized by far.
  let angularLightSize = radius / max(compare * far, 1e-4);

  // STEP 1: blocker search
  var blockerSum = 0.0;
  var numBlockers = 0.0;
  PCSSFindBlockerCube(depths, depthSampler, dir, T, B, compare, angularLightSize, phase, &blockerSum, &numBlockers);

  if (numBlockers == 0.0) {
    return 1.0;
  }
  let avgBlockerDepth = blockerSum / numBlockers;

  // STEP 2: penumbra size (similar triangles about the light; far cancels in the
  // normalized-distance ratio).
  let penumbra = max(compare - avgBlockerDepth, 0.0) / max(avgBlockerDepth, 1e-4);
  let filterRadius = penumbra * angularLightSize;

  // STEP 3: filtering (manual compare)
  return PCSSPCFFilterCube(depths, depthSampler, dir, T, B, compare, phase, filterRadius);
}
`;

export { PCSSCommon, PCSS, PCSSCube };
