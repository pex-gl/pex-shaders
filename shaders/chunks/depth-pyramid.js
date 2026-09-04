/**
 * Depth pyramid
 *
 * The linear view-space depth pyramid both screen-space AO estimators sample:
 * one compute dispatch turning the hardware depth buffer into a mip chain,
 * so a tap far from its pixel reads a coarse level that is still in cache.
 *
 * Levels 1..3 reduce through workgroup memory, which is why this is a compute
 * pass rather than one fullscreen pass per level: the whole chain costs a
 * single read of the depth buffer.
 *
 * The reduction filter is the one thing the two estimators disagree on, so it
 * is an override rather than two copies of the reduction:
 *
 * - Rotated grid subsampling picks one of each quad's four depths instead of
 *   combining them, so every level holds a value that was actually in the
 *   scene. McGuire12 table 1 compares five filters and recommends it.
 * - The weighted mean biases towards the closest of the four, so a mip keeps a
 *   thin occluder rather than averaging it into the surface behind it. XeGTAO's
 *   own choice, and GTAO's falloff parameters are tuned against it.
 *
 * Paper: https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf
 *
 * Requires `depthRead` and `math.saturate`.
 *
 * @type {string}
 * @alias module:chunks.depthPyramid
 */
export default /* wgsl */ `
struct DepthPyramidParams {
  near: f32,
  far: f32,
  // Weighted mean only: the distance over which a nearer depth outweighs the
  // rest of its quad. Ignored under rotated grid subsampling.
  effectRadius: f32,
  falloffRange: f32,
}

override DEPTH_PYRAMID_ROTATED_GRID: bool = false;

// Found empirically by the XeGTAO reference implementation.
const DEPTH_PYRAMID_RANGE_SCALE_FACTOR: f32 = 0.75;

fn depthPyramidWeightedMean(depths: vec4f, params: DepthPyramidParams) -> f32 {
  let effectRadius = DEPTH_PYRAMID_RANGE_SCALE_FACTOR * params.effectRadius;
  let falloffRange = params.falloffRange * effectRadius;
  let falloffFrom = effectRadius * (1.0 - params.falloffRange);
  let falloffMul = -1.0 / falloffRange;
  let falloffAdd = falloffFrom / falloffRange + 1.0;

  let maxDepth = max(max(depths.x, depths.y), max(depths.z, depths.w));
  let weights = saturateVec4((vec4f(maxDepth) - depths) * falloffMul + falloffAdd);

  return dot(weights, depths) / (weights.x + weights.y + weights.z + weights.w);
}

// z[m+1](x, y) = z[m](2x + (y & 1), 2y + (x & 1)). Rotating the choice with the
// destination parity is what stops the subsample drifting towards one corner of
// the quad and reintroducing the directional bias averaging would have caused.
fn depthPyramidRotatedGrid(depths: vec4f, destCoord: vec2i) -> f32 {
  let odd = (destCoord.y & 1) != 0;
  return select(
    select(depths.x, depths.y, odd),
    select(depths.z, depths.w, odd),
    (destCoord.x & 1) != 0
  );
}

// The inverse, applied once per level: which full resolution texel a coarse
// value came from. Only a subsampling filter has one — a filter that combines
// its quad has no single source — and it is what lets a reader reconstruct a
// sample at a point that was actually in the scene. Pairing a coarse depth with
// the reader's own tap position instead displaces the sample off the surface by
// the depth slope across the level's footprint, which reads as ambient
// occlusion that grows with how steeply a surface is inclined to the view.
fn depthPyramidRotatedGridSource(mipCoord: vec2i, mipLevel: i32) -> vec2i {
  var coord = mipCoord;
  for (var level = 0; level < mipLevel; level++) {
    coord = vec2i(2 * coord.x + (coord.y & 1), 2 * coord.y + (coord.x & 1));
  }
  return coord;
}

// \`depths\` holds the quad in the order (0,0), (1,0), (0,1), (1,1).
fn depthPyramidFilter(depths: vec4f, destCoord: vec2i, params: DepthPyramidParams) -> f32 {
  if (DEPTH_PYRAMID_ROTATED_GRID) {
    return depthPyramidRotatedGrid(depths, destCoord);
  }
  return depthPyramidWeightedMean(depths, params);
}

// Screen space to view space depth, pinned so the background reads exactly the
// far plane — which is what an estimator tests to skip a pixel with no surface.
// Pinned rather than clamped: whether the linearisation of a cleared depth
// lands above or below far is decided by how near and far round in f32, and a
// value a fraction under it is a surface as far as that test is concerned. Of
// the near/far pairs a camera plausibly uses, about a third round the wrong
// way, and the estimator then runs across the whole sky.
fn depthPyramidLinearize(depthTex: texture_depth_2d, pixCoord: vec2i, params: DepthPyramidParams) -> f32 {
  let size = vec2i(textureDimensions(depthTex, 0));
  let screenDepth = textureLoad(depthTex, clamp(pixCoord, vec2i(0), size - vec2i(1)), 0);
  if (screenDepth >= 1.0) {
    return params.far;
  }
  return min(linearizeDepthPerspZO(screenDepth, params.near, params.far), params.far);
}

// The pyramid is r32uint holding bitcast floats: core WebGPU has no
// storage-capable 16-bit single-channel format, and r32float binds as
// unfilterable-float. It costs nothing — both estimators read the pyramid by
// point access anyway, since filtering blends depths describing different
// surfaces, and across mip levels different resolutions of them.
fn depthPyramidLoad(depthTex: texture_2d<u32>, pixCoord: vec2i, mipLevel: i32) -> f32 {
  let size = vec2i(textureDimensions(depthTex, u32(mipLevel)));
  return bitcast<f32>(textureLoad(depthTex, clamp(pixCoord, vec2i(0), size - vec2i(1)), mipLevel).x);
}

fn depthPyramidSample(depthTex: texture_2d<u32>, screenPos: vec2f, mipLevel: i32) -> f32 {
  let size = vec2f(textureDimensions(depthTex, u32(mipLevel)));
  return depthPyramidLoad(depthTex, vec2i(screenPos * size), mipLevel);
}

var<workgroup> depthPyramidScratch: array<array<f32, 8u>, 8u>;

// Each thread covers a 2x2 block, so a workgroup of 8x8 covers 16x16 pixels and
// produces four levels.
fn depthPyramidBuild16x16(
  dispatchThreadID: vec2u,
  groupThreadID: vec2u,
  depthTex: texture_depth_2d,
  params: DepthPyramidParams,
  outDepth0: texture_storage_2d<r32uint, write>,
  outDepth1: texture_storage_2d<r32uint, write>,
  outDepth2: texture_storage_2d<r32uint, write>,
  outDepth3: texture_storage_2d<r32uint, write>
) {
  // MIP 0
  let baseCoord = vec2i(dispatchThreadID);
  let pixCoord = baseCoord * 2;

  let depths = vec4f(
    depthPyramidLinearize(depthTex, pixCoord + vec2i(0, 0), params),
    depthPyramidLinearize(depthTex, pixCoord + vec2i(1, 0), params),
    depthPyramidLinearize(depthTex, pixCoord + vec2i(0, 1), params),
    depthPyramidLinearize(depthTex, pixCoord + vec2i(1, 1), params)
  );
  // Stores past the edge of a texture are dropped, so the ragged last tile of a
  // viewport that is not a multiple of 16 needs no guard.
  textureStore(outDepth0, pixCoord + vec2i(0, 0), vec4u(bitcast<u32>(depths.x)));
  textureStore(outDepth0, pixCoord + vec2i(1, 0), vec4u(bitcast<u32>(depths.y)));
  textureStore(outDepth0, pixCoord + vec2i(0, 1), vec4u(bitcast<u32>(depths.z)));
  textureStore(outDepth0, pixCoord + vec2i(1, 1), vec4u(bitcast<u32>(depths.w)));

  // MIP 1
  let dm1 = depthPyramidFilter(depths, baseCoord, params);
  textureStore(outDepth1, baseCoord, vec4u(bitcast<u32>(dm1)));
  depthPyramidScratch[groupThreadID.x][groupThreadID.y] = dm1;

  // Every barrier sits at uniform scope: each level reduces through shared
  // memory with a quarter of the threads, and a barrier reached by only some
  // invocations of a workgroup is undefined.
  workgroupBarrier();

  // MIP 2
  if (all((groupThreadID % vec2u(2u)) == vec2u(0u))) {
    let destCoord = baseCoord / 2;
    let dm2 = depthPyramidFilter(vec4f(
      depthPyramidScratch[groupThreadID.x + 0u][groupThreadID.y + 0u],
      depthPyramidScratch[groupThreadID.x + 1u][groupThreadID.y + 0u],
      depthPyramidScratch[groupThreadID.x + 0u][groupThreadID.y + 1u],
      depthPyramidScratch[groupThreadID.x + 1u][groupThreadID.y + 1u]
    ), destCoord, params);
    textureStore(outDepth2, destCoord, vec4u(bitcast<u32>(dm2)));
    depthPyramidScratch[groupThreadID.x][groupThreadID.y] = dm2;
  }

  workgroupBarrier();

  // MIP 3
  if (all((groupThreadID % vec2u(4u)) == vec2u(0u))) {
    let destCoord = baseCoord / 4;
    let dm3 = depthPyramidFilter(vec4f(
      depthPyramidScratch[groupThreadID.x + 0u][groupThreadID.y + 0u],
      depthPyramidScratch[groupThreadID.x + 2u][groupThreadID.y + 0u],
      depthPyramidScratch[groupThreadID.x + 0u][groupThreadID.y + 2u],
      depthPyramidScratch[groupThreadID.x + 2u][groupThreadID.y + 2u]
    ), destCoord, params);
    textureStore(outDepth3, destCoord, vec4u(bitcast<u32>(dm3)));
  }
}
`;
