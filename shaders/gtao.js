/**
 * GTAO (Ground Truth Ambient Occlusion)
 *
 * Paper:
 * https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf
 *
 * Reference Implementation:
 * https://github.com/GameTechDev/XeGTAO/blob/master/Source/Rendering/Shaders/XeGTAO.hlsli
 *
 * Split into the three passes the technique needs, since they share only the
 * constants, the estimator, and the edge-aware denoiser. The depth pyramid the
 * estimator samples is built by the shared `depthPyramid` chunk.
 *
 * Two conventions differ from the reference and everything else follows from
 * them. View space here is right-handed with -Z forward, where XeGTAO's is
 * left-handed; only the bent normal's construction frame notices, the rest
 * being dot and cross products among consistently-signed vectors. And screen
 * coordinates are WebGPU's, with V pointing down, which the vertical terms of
 * `ndcToViewMul`/`ndcToViewAdd` and the slice direction's `omega` carry the
 * sign for.
 *
 * Updates: Damien Seguin (2023-10, 2026-08)
 *
 * @type {object}
 * @name gtao
 * @static
 */

/**
 * Constants, parameters and the helpers both passes share. Requires `math.PI`,
 * `math.HALF_PI`, `math.saturate` and `depthRead`.
 *
 * @member {string}
 */
const common = /* wgsl */ `
struct GTAOParams {
  // View position = (ndcToViewMul * uv + ndcToViewAdd) * viewspaceZ. Baked per
  // camera so no pixel evaluates tan(), and so the vertical term can carry the
  // sign that turns a V-down screen coordinate back into a Y-up view space.
  ndcToViewMul: vec2f,
  ndcToViewAdd: vec2f,
  // ndcToViewMul / viewportSize: view-space size of one pixel at unit depth.
  ndcToViewMulByPixelSize: vec2f,
  viewportSize: vec2f,
  viewportPixelSize: vec2f,
  near: f32,
  far: f32,
  // World (view space) size of the occlusion sphere.
  effectRadius: f32,
  // Lets the tuned radius differ from the ground-truth one, countering biases
  // that screen-space gathering has no way to avoid.
  radiusMultiplier: f32,
  // Fraction of the radius over which a sample's contribution fades out.
  effectFalloffRange: f32,
  // 1.0 spreads samples evenly along a slice, higher pulls them towards the
  // center, where the small crevices are.
  sampleDistributionPower: f32,
  // Discards samples behind the center sooner, countering a depth buffer that
  // holds no thickness information.
  thinOccluderCompensation: f32,
  // occlusion = pow(occlusion, finalValuePower).
  finalValuePower: f32,
  // How far to take the term towards full occlusion: 0 leaves the surface
  // unoccluded, 1 applies the estimate as computed. Applied here rather than
  // where the term is consumed, since it is consumed as a lighting input.
  mix: f32,
  // Trades memory bandwidth against temporal stability and thin-object
  // accuracy: higher reads a coarser depth mip at the same offset.
  depthMipSamplingOffset: f32,
  // Center tap weight in the denoiser: higher blurs less.
  denoiseBlurBeta: f32,
  brightness: f32,
  contrast: f32,
  // frameIndex % 64 under a temporal filter, 0 without one.
  noiseIndex: u32,
}

override GTAO_NUM_SLICES: i32 = 3;
override GTAO_NUM_STEPS_PER_SLICE: i32 = 3;
override USE_GTAO_BENT_NORMALS: bool = false;

// If the offset is under approximately pixel size, push it out to this distance.
const GTAO_PIXEL_TOO_CLOSE_THRESHOLD: f32 = 1.3;
// Coarsest level the prefilter produces. One below the reference's, because a
// storage texture view is a single mip and WebGPU only guarantees four storage
// texture bindings per stage (maxStorageTexturesPerShaderStage) — so a fifth
// level would cost every adapter that stops at the guarantee. It reaches far
// enough: at the default depthMipSamplingOffset, level 3 already covers sample
// offsets past ~80 pixels.
const GTAO_DEPTH_MIP_MAX_LEVEL: f32 = 3.0;
// Raw visibility overshoots 1 and only averages out to it once denoised, so it
// is divided by this on the way into UNORM and multiplied back by the last
// denoise pass — see \`finalApply\`.
const GTAO_OCCLUSION_TERM_SCALE: f32 = 1.5;

// Inputs are screen UV and viewspace depth, output is viewspace position. The
// pyramid stores a positive distance; -Z forward puts the surface in front of
// the camera.
fn gtaoComputeViewspacePosition(screenPos: vec2f, viewspaceDepth: f32, params: GTAOParams) -> vec3f {
  return vec3f((params.ndcToViewMul * screenPos + params.ndcToViewAdd) * viewspaceDepth, -viewspaceDepth);
}

// http://h14s.p5r.org/2012/09/0x5f3759df.html, [Drobot2014a] Low Level
// Optimizations for GCN
fn gtaoFastSqrt(x: f32) -> f32 {
  return bitcast<f32>(0x1fbd1df5 + (bitcast<i32>(x) >> 1u));
}

// Input [-1, 1] and output [0, PI], from https://seblagarde.wordpress.com/2014/12/01/inverse-trigonometric-functions-gpu-optimization-for-amd-gcn-architecture/
fn gtaoFastACos(inX: f32) -> f32 {
  let x = abs(inX);
  var res = -0.156583 * x + HALF_PI;
  res *= gtaoFastSqrt(1.0 - x);
  return select(PI - res, res, inX >= 0.0);
}

// Index along a Hilbert curve, which visits every pixel of a 64x64 tile without
// ever leaving its own neighbourhood.
const GTAO_HILBERT_WIDTH: u32 = 64u;

fn gtaoHilbertIndex(inPosX: u32, inPosY: u32) -> u32 {
  var posX = inPosX;
  var posY = inPosY;
  var index = 0u;

  for (var level = GTAO_HILBERT_WIDTH / 2u; level > 0u; level /= 2u) {
    let regionX = u32((posX & level) > 0u);
    let regionY = u32((posY & level) > 0u);
    index += level * level * ((3u * regionX) ^ regionY);

    if (regionY == 0u) {
      if (regionX == 1u) {
        posX = (GTAO_HILBERT_WIDTH - 1u) - posX;
        posY = (GTAO_HILBERT_WIDTH - 1u) - posY;
      }
      let temp = posX;
      posX = posY;
      posY = temp;
    }
  }

  return index;
}

// Hilbert curve driving an R2 sequence (https://www.shadertoy.com/view/3tB3z3):
// low-discrepancy in screen space, so neighbouring pixels take complementary
// samples for the denoiser to average — the property a blue noise texture is
// normally fetched for, at no bandwidth and with no tile size to alias against.
// Advancing the index per frame walks the same sequence, which is what a
// temporal filter needs in order to converge rather than flicker.
fn gtaoSpatioTemporalNoise(pixCoord: vec2u, temporalIndex: u32) -> vec2f {
  var index = gtaoHilbertIndex(pixCoord.x % GTAO_HILBERT_WIDTH, pixCoord.y % GTAO_HILBERT_WIDTH);
  // 288 is the reference's empirical pick for a 64-wide curve.
  index += 288u * (temporalIndex % 64u);

  // R2 sequence, see http://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/
  return fract(0.5 + f32(index) * vec2f(0.75487766624669276, 0.5698402909980533));
}
`;

/**
 * The estimator: a horizon search over `GTAO_NUM_SLICES` slices of
 * `GTAO_NUM_STEPS_PER_SLICE` steps, producing visibility, a bent normal under
 * `USE_GTAO_BENT_NORMALS`, and the edge weights the denoiser needs. Requires
 * {@link common}, `depthPyramid` and `colorCorrection`.
 *
 * @member {string}
 */
const main = /* wgsl */ `
struct GTAOTerm {
  // Raw, before the UNORM scale: overshoots 1 until denoised.
  visibility: f32,
  // Average unoccluded direction, in view space. Equal to the surface normal
  // unless USE_GTAO_BENT_NORMALS is on.
  bentNormal: vec3f,
  // Per-direction weights for the denoiser, 0 across a depth discontinuity.
  edgesLRTB: vec4f,
}

fn gtaoCalculateEdges(centerZ: f32, leftZ: f32, rightZ: f32, topZ: f32, bottomZ: f32) -> vec4f {
  var edgesLRTB = vec4f(leftZ, rightZ, topZ, bottomZ) - centerZ;

  // A surface seen at a grazing angle has a large depth gradient and no edge;
  // comparing against the slope-adjusted difference tells the two apart.
  let slopeLR = (edgesLRTB.y - edgesLRTB.x) * 0.5;
  let slopeTB = (edgesLRTB.w - edgesLRTB.z) * 0.5;
  let edgesLRTBSlopeAdjusted = edgesLRTB + vec4f(slopeLR, -slopeLR, slopeTB, -slopeTB);
  edgesLRTB = min(abs(edgesLRTB), abs(edgesLRTBSlopeAdjusted));

  return saturateVec4(1.25 - edgesLRTB / (centerZ * 0.011));
}

// Visibility in .x, bent normal in .yzw. Only the first channel exists unless
// USE_GTAO_BENT_NORMALS is on, in which case the target has four.
fn gtaoEncodeVisibilityBentNormal(term: GTAOTerm, finalApply: bool) -> vec4f {
  let scale = select(1.0 / GTAO_OCCLUSION_TERM_SCALE, 1.0, finalApply);
  return vec4f(saturateF32(term.visibility * scale), term.bentNormal * 0.5 + 0.5);
}

// "Efficiently building a matrix to rotate one vector to another"
// http://cs.brown.edu/research/pubs/pdfs/1999/Moller-1999-EBA.pdf
fn gtaoRotFromToMatrix(fromVec: vec3f, toVec: vec3f) -> mat3x3f {
  let e = dot(fromVec, toVec);
  // Only the near-identity case is short-circuited. The antiparallel one has no
  // single answer, and cannot arise here: \`fromVec\` is the view axis and \`toVec\`
  // view vector of a pixel in front of the camera.
  if (e > 1.0 - 0.0003) {
    return mat3x3f(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
  }

  let v = cross(fromVec, toVec);
  // Optimization by Gottfried Chen.
  let h = 1.0 / (1.0 + e);
  let hvx = h * v.x;
  let hvz = h * v.z;
  let hvxy = hvx * v.y;
  let hvxz = hvx * v.z;
  let hvyz = hvz * v.y;

  // Column-major, so each column is one column of the reference's row-major
  // matrix.
  return mat3x3f(
    vec3f(e + hvx * v.x, hvxy + v.z, hvxz - v.y),
    vec3f(hvxy - v.z, e + h * v.y * v.y, hvyz + v.x),
    vec3f(hvxz + v.y, hvyz - v.x, e + hvz * v.z)
  );
}

// See "Algorithm 1" in the paper.
fn gtaoMainPass(
  pixCoord: vec2i,
  depthTex: texture_2d<u32>,
  normalTex: texture_2d<f32>,
  params: GTAOParams
) -> GTAOTerm {
  var term: GTAOTerm;

  let normalizedScreenPos = (vec2f(pixCoord) + 0.5) * params.viewportPixelSize;

  // viewspace Z at the center, and at left top right bottom
  var viewspaceZ = depthPyramidLoad(depthTex, pixCoord, 0);
  let pixLZ = depthPyramidLoad(depthTex, pixCoord + vec2i(-1, 0), 0);
  let pixRZ = depthPyramidLoad(depthTex, pixCoord + vec2i(1, 0), 0);
  let pixTZ = depthPyramidLoad(depthTex, pixCoord + vec2i(0, -1), 0);
  let pixBZ = depthPyramidLoad(depthTex, pixCoord + vec2i(0, 1), 0);

  term.edgesLRTB = gtaoCalculateEdges(viewspaceZ, pixLZ, pixRZ, pixTZ, pixBZ);

  let viewspaceNormal = normalize(textureLoad(normalTex, pixCoord, 0).xyz * 2.0 - 1.0);
  term.bentNormal = viewspaceNormal;

  // Background: no surface, nothing to occlude.
  if (viewspaceZ >= params.far) {
    term.visibility = 1.0;
    return term;
  }

  // Move the center pixel slightly towards the camera so its own surface cannot
  // read as an occluder of itself through depth imprecision.
  viewspaceZ *= 0.99999;

  let pixCenterPos = gtaoComputeViewspacePosition(normalizedScreenPos, viewspaceZ, params);
  let viewVec = normalize(-pixCenterPos);

  let effectRadius = params.effectRadius * params.radiusMultiplier;
  let falloffRange = params.effectFalloffRange * effectRadius;
  let falloffFrom = effectRadius * (1.0 - params.effectFalloffRange);
  // Fadeout precompute optimisation.
  let falloffMul = -1.0 / falloffRange;
  let falloffAdd = falloffFrom / falloffRange + 1.0;
  let thinScale = 1.0 + params.thinOccluderCompensation;

  let sliceCount = f32(GTAO_NUM_SLICES);
  let stepsPerSlice = f32(GTAO_NUM_STEPS_PER_SLICE);

  let localNoise = gtaoSpatioTemporalNoise(vec2u(pixCoord), params.noiseIndex);
  let noiseSlice = localNoise.x;
  let noiseSample = localNoise.y;

  // Approximate viewspace pixel size at pixCoord, turning the world-space radius
  // into a radius in pixels — which is what makes the sampling disk shrink with
  // distance.
  let pixelDirRBViewspaceSizeAtCenterZ = viewspaceZ * params.ndcToViewMulByPixelSize.x;
  let screenspaceRadius = effectRadius / pixelDirRBViewspaceSizeAtCenterZ;

  // Fade out for small screen radii: a disk covering a few pixels has no
  // occlusion signal left to gather.
  var visibility = saturateF32((10.0 - screenspaceRadius) / 100.0) * 0.5;
  var bentNormal = vec3f(0.0);

  // Minimum distance to start sampling from, to avoid the center pixel, which
  // occludes nothing.
  let minS = GTAO_PIXEL_TOO_CLOSE_THRESHOLD / screenspaceRadius;

  for (var slice = 0; slice < GTAO_NUM_SLICES; slice++) {
    let sliceFloat = f32(slice);
    // Lines 5, 6 from the paper.
    let sliceK = (sliceFloat + noiseSlice) / sliceCount;
    let phi = sliceK * PI;
    let cosPhi = cos(phi);
    let sinPhi = sin(phi);
    // Screen offsets run in a V-down coordinate, so the slice direction's
    // vertical term flips on the way out of view space. In pixels, for later use.
    let omega = vec2f(cosPhi, -sinPhi) * screenspaceRadius;

    // Line 8 from the paper.
    let directionVec = vec3f(cosPhi, sinPhi, 0.0);
    // Line 9 from the paper.
    let orthoDirectionVec = directionVec - dot(directionVec, viewVec) * viewVec;
    // Line 10 from the paper. Orthogonal to directionVec and viewVec, which is
    // what defines projectedNormalVec.
    let axisVec = normalize(cross(orthoDirectionVec, viewVec));
    // Line 11 from the paper.
    let projectedNormalVec = viewspaceNormal - axisVec * dot(viewspaceNormal, axisVec);

    // Line 13 from the paper.
    let signNorm = sign(dot(orthoDirectionVec, projectedNormalVec));
    // Line 14 from the paper.
    var projectedNormalVecLength = length(projectedNormalVec);
    let cosNorm = saturateF32(dot(projectedNormalVec, viewVec) / projectedNormalVecLength);
    // Line 15 from the paper.
    let n = signNorm * gtaoFastACos(cosNorm);

    // Lower weight target rather than the paper's -1: below the horizon a
    // weight means something different depending on the normal.
    let lowHorizonCos0 = cos(n + HALF_PI);
    let lowHorizonCos1 = cos(n - HALF_PI);

    // Lines 17, 18 from the paper, with the 'side' loop manually unrolled.
    var horizonCos0 = lowHorizonCos0;
    var horizonCos1 = lowHorizonCos1;

    for (var step = 0; step < GTAO_NUM_STEPS_PER_SLICE; step++) {
      let stepFloat = f32(step);
      // R1 sequence (http://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/)
      let stepBaseNoise = (sliceFloat + stepFloat * stepsPerSlice) * 0.6180339887498948;
      let stepNoise = fract(noiseSample + stepBaseNoise);

      // Approximately line 20 from the paper, with added noise, the distribution
      // modifier, and the center pixel avoided.
      let s = pow((stepFloat + stepNoise) / stepsPerSlice, params.sampleDistributionPower) + minS;

      // Approximately lines 21-22 from the paper, unrolled.
      var sampleOffset = s * omega;
      let sampleOffsetLength = length(sampleOffset);

      // Wide offsets read a coarser level so the taps stop thrashing the cache,
      // at the cost of thin occluders averaging into what is behind them.
      let mipLevel = i32(clamp(
        log2(sampleOffsetLength) - params.depthMipSamplingOffset,
        0.0,
        GTAO_DEPTH_MIP_MAX_LEVEL
      ));

      // Snap to pixel centre so the direction math matches the texels actually
      // read: an unsnapped offset skews the slope derived from them.
      sampleOffset = round(sampleOffset) * params.viewportPixelSize;

      let sampleScreenPos0 = normalizedScreenPos + sampleOffset;
      let sampleScreenPos1 = normalizedScreenPos - sampleOffset;
      let sz0 = depthPyramidSample(depthTex, sampleScreenPos0, mipLevel);
      let sz1 = depthPyramidSample(depthTex, sampleScreenPos1, mipLevel);
      let samplePos0 = gtaoComputeViewspacePosition(sampleScreenPos0, sz0, params);
      let samplePos1 = gtaoComputeViewspacePosition(sampleScreenPos1, sz1, params);

      let sampleDelta0 = samplePos0 - pixCenterPos;
      let sampleDelta1 = samplePos1 - pixCenterPos;

      // Approximately lines 23, 24 from the paper, unrolled.
      let sampleHorizonVec0 = normalize(sampleDelta0);
      let sampleHorizonVec1 = normalize(sampleDelta1);

      // Any sample out of radius is discarded, the falloff range making the
      // transition smooth — a modified idea from "4.3 Implementation details,
      // Bounding the sampling area". Stretching the depth axis is the reference's
      // own thickness heuristic, discarding samples behind the center sooner.
      let falloffBase0 = length(vec3f(sampleDelta0.xy, sampleDelta0.z * thinScale));
      let falloffBase1 = length(vec3f(sampleDelta1.xy, sampleDelta1.z * thinScale));
      let weight0 = saturateF32(falloffBase0 * falloffMul + falloffAdd);
      let weight1 = saturateF32(falloffBase1 * falloffMul + falloffAdd);

      // Sample horizon cos, then discard unwanted samples. Would be more correct
      // as cos(mix(acos(lowHorizonCosN), acos(shcN), weightN)), but that is two
      // more transcendentals per sample.
      let shc0 = mix(lowHorizonCos0, dot(sampleHorizonVec0, viewVec), weight0);
      let shc1 = mix(lowHorizonCos1, dot(sampleHorizonVec1, viewVec), weight1);

      // Thickness heuristic — see "4.3 Implementation details, Height-field
      // assumption considerations". The reference ships it disabled.
      horizonCos0 = max(horizonCos0, shc0);
      horizonCos1 = max(horizonCos1, shc1);
    }

    // Fudge for a slight overdarkening on high slopes: in the reference's
    // training set 0.05 scores within 0.11 dB of disabled.
    projectedNormalVecLength = mix(projectedNormalVecLength, 1.0, 0.05);

    // Line ~27, unrolled.
    let h0 = -gtaoFastACos(horizonCos1);
    let h1 = gtaoFastACos(horizonCos0);
    let sinN = sin(n);
    let iarc0 = (cosNorm + 2.0 * h0 * sinN - cos(2.0 * h0 - n)) * 0.25;
    let iarc1 = (cosNorm + 2.0 * h1 * sinN - cos(2.0 * h1 - n)) * 0.25;
    visibility += projectedNormalVecLength * (iarc0 + iarc1);

    if (USE_GTAO_BENT_NORMALS) {
      // See "Algorithm 2 Extension that computes bent normals b."
      let t0 = (6.0 * sin(h0 - n) - sin(3.0 * h0 - n) + 6.0 * sin(h1 - n) - sin(3.0 * h1 - n) + 16.0 * sinN - 3.0 * (sin(h0 + n) + sin(h1 + n))) / 12.0;
      let t1 = (-cos(3.0 * h0 - n) - cos(3.0 * h1 - n) + 8.0 * cos(n) - 3.0 * (cos(h0 + n) + cos(h1 + n))) / 12.0;
      // Built against a view axis of +Z — this view space's -Z forward, where the
      // reference's is -Z for its left-handed one — then rotated onto the pixel's
      // own view vector.
      var localBentNormal = gtaoRotFromToMatrix(vec3f(0.0, 0.0, 1.0), viewVec) *
        vec3f(directionVec.xy * t0, t1);
      bentNormal += localBentNormal * projectedNormalVecLength;
    }
  }

  visibility = pow(visibility / sliceCount, params.finalValuePower);
  visibility = mix(1.0, brightnessContrastF32(visibility, params.brightness, params.contrast), params.mix);
  // Disallow total occlusion, which wouldn't make sense anyhow since the pixel is
  // visible, and which also helps with packing bent normals.
  term.visibility = max(0.03, visibility);

  if (USE_GTAO_BENT_NORMALS) {
    term.bentNormal = normalize(bentNormal);
  }

  return term;
}
`;

/**
 * Edge-aware denoiser. Averages a 3x3 neighbourhood weighted by the estimator's
 * edges, so occlusion never crosses a depth discontinuity. `finalApply`
 * restores the UNORM scale and renormalises the bent normal, and belongs on the
 * last pass only. Requires {@link common} and {@link main}.
 *
 * @member {string}
 */
const denoise = /* wgsl */ `
// Lets a little occlusion leak between neighbours where three or four sides are
// edges, which reduces both spatial and temporal aliasing.
const GTAO_LEAK_THRESHOLD: f32 = 2.5;
const GTAO_LEAK_STRENGTH: f32 = 0.5;
const GTAO_DIAGONAL_WEIGHT: f32 = 0.425;

fn gtaoLoadEdges(edgesTex: texture_2d<f32>, pixCoord: vec2i) -> vec4f {
  let size = vec2i(textureDimensions(edgesTex, 0));
  return textureLoad(edgesTex, clamp(pixCoord, vec2i(0), size - vec2i(1)), 0);
}

fn gtaoLoadAOTerm(aoTex: texture_2d<f32>, pixCoord: vec2i) -> vec4f {
  let size = vec2i(textureDimensions(aoTex, 0));
  return textureLoad(aoTex, clamp(pixCoord, vec2i(0), size - vec2i(1)), 0);
}

fn gtaoAddSample(
  ssaoValue: vec4f,
  edgeValue: f32,
  sum: ptr<function, vec4f>,
  sumWeight: ptr<function, f32>
) {
  *sum += edgeValue * ssaoValue;
  *sumWeight += edgeValue;
}

fn gtaoDenoise(
  pixCoord: vec2i,
  aoTex: texture_2d<f32>,
  edgesTex: texture_2d<f32>,
  blurAmount: f32,
  finalApply: bool
) -> vec4f {
  let edgesL_LRTB = gtaoLoadEdges(edgesTex, pixCoord + vec2i(-1, 0));
  let edgesR_LRTB = gtaoLoadEdges(edgesTex, pixCoord + vec2i(1, 0));
  let edgesT_LRTB = gtaoLoadEdges(edgesTex, pixCoord + vec2i(0, -1));
  let edgesB_LRTB = gtaoLoadEdges(edgesTex, pixCoord + vec2i(0, 1));

  // Edge detection does not guarantee that a left edge on the right pixel
  // matches the right edge on the left one. Folding in the neighbour's opposite
  // side enforces it, creating a slightly sharper blur that works well with TAA.
  var edgesC_LRTB = gtaoLoadEdges(edgesTex, pixCoord) *
    vec4f(edgesL_LRTB.y, edgesR_LRTB.x, edgesT_LRTB.w, edgesB_LRTB.z);

  let edginess = (saturateF32(4.0 - GTAO_LEAK_THRESHOLD - dot(edgesC_LRTB, vec4f(1.0))) /
    (4.0 - GTAO_LEAK_THRESHOLD)) * GTAO_LEAK_STRENGTH;
  edgesC_LRTB = saturateVec4(edgesC_LRTB + edginess);

  // For diagonals: a corner neighbour is reachable two ways, so it is worth half
  // of either path being open.
  let weightTL = GTAO_DIAGONAL_WEIGHT * (edgesC_LRTB.x * edgesL_LRTB.z + edgesC_LRTB.z * edgesT_LRTB.x);
  let weightTR = GTAO_DIAGONAL_WEIGHT * (edgesC_LRTB.z * edgesT_LRTB.y + edgesC_LRTB.y * edgesR_LRTB.z);
  let weightBL = GTAO_DIAGONAL_WEIGHT * (edgesC_LRTB.w * edgesB_LRTB.x + edgesC_LRTB.x * edgesL_LRTB.w);
  let weightBR = GTAO_DIAGONAL_WEIGHT * (edgesC_LRTB.y * edgesR_LRTB.w + edgesC_LRTB.w * edgesB_LRTB.y);

  var sumWeight = blurAmount;
  var sum = gtaoLoadAOTerm(aoTex, pixCoord) * sumWeight;

  gtaoAddSample(gtaoLoadAOTerm(aoTex, pixCoord + vec2i(-1, 0)), edgesC_LRTB.x, &sum, &sumWeight);
  gtaoAddSample(gtaoLoadAOTerm(aoTex, pixCoord + vec2i(1, 0)), edgesC_LRTB.y, &sum, &sumWeight);
  gtaoAddSample(gtaoLoadAOTerm(aoTex, pixCoord + vec2i(0, -1)), edgesC_LRTB.z, &sum, &sumWeight);
  gtaoAddSample(gtaoLoadAOTerm(aoTex, pixCoord + vec2i(0, 1)), edgesC_LRTB.w, &sum, &sumWeight);

  gtaoAddSample(gtaoLoadAOTerm(aoTex, pixCoord + vec2i(-1, -1)), weightTL, &sum, &sumWeight);
  gtaoAddSample(gtaoLoadAOTerm(aoTex, pixCoord + vec2i(1, -1)), weightTR, &sum, &sumWeight);
  gtaoAddSample(gtaoLoadAOTerm(aoTex, pixCoord + vec2i(-1, 1)), weightBL, &sum, &sumWeight);
  gtaoAddSample(gtaoLoadAOTerm(aoTex, pixCoord + vec2i(1, 1)), weightBR, &sum, &sumWeight);

  var aoTerm = sum / sumWeight;

  if (finalApply) {
    aoTerm.x = saturateF32(aoTerm.x * GTAO_OCCLUSION_TERM_SCALE);
    if (USE_GTAO_BENT_NORMALS) {
      // Averaged encoded, which matches averaging the directions since the
      // encoding is affine, but the sum is no longer unit length.
      aoTerm = vec4f(aoTerm.x, normalize(aoTerm.yzw * 2.0 - 1.0) * 0.5 + 0.5);
    }
  }

  return aoTerm;
}
`;

export { common, main, denoise };
