// TODO: precompute luma in color attachment
// TODO: don't apply where there is strong motion blur or depth of field.

/**
 * FXAA
 *
 * Paper:
 *
 * - https://developer.download.nvidia.com/assets/gamedev/files/sdk/11/FXAA_WhitePaper.pdf
 *
 * Reference Implementations:
 *
 * - https://blog.simonrodriguez.fr/articles/2016/07/implementing_fxaa.html
 * - https://gist.github.com/kosua20/0c506b81b3812ac900048059d2383126
 *
 * Updates: Damien Seguin (2023-10)
 *
 * @type {string}
 * @alias module:chunks.fxaa
 */
export default /* wgsl */ `
// FXAA_EDGE_THRESHOLD_MIN/MAX are expected to be declared as \`override\` f32
// by the composing pipeline shader (defaults below match "High" quality).
override FXAA_EDGE_THRESHOLD_MIN: f32 = 0.0312; // 1 / 32
override FXAA_EDGE_THRESHOLD_MAX: f32 = 0.125; // 1 / 8

const FXAA_ITERATIONS: i32 = 12;
const FXAA_ONE_OVER_TWELVE: f32 = 1.0 / 12.0;

fn FXAA_QUALITY(q: i32) -> f32 {
  if (q < 5) {
    return 1.0;
  }
  if (q > 5) {
    if (q < 10) {
      return 2.0;
    }
    if (q < 11) {
      return 4.0;
    }
    return 8.0;
  }
  return 1.5;
}

// Performs FXAA post-process anti-aliasing as described in the Nvidia FXAA white paper and the associated shader code.
fn fxaa(
  lumaTexture: texture_2d<f32>,
  lumaTextureSampler: sampler,
  uv: vec2f,
  uvLeftUp: vec2f,
  uvRightUp: vec2f,
  uvLeftDown: vec2f,
  uvRightDown: vec2f,
  uvDown: vec2f,
  uvUp: vec2f,
  uvLeft: vec2f,
  uvRight: vec2f,
  texelSize: vec2f,
  subPixelQuality: f32
) -> vec2f {
  // Luma at the current fragment
  let lumaCenter = readLumaTexture(lumaTexture, lumaTextureSampler, uv);

  // Luma at the four direct neighbours of the current fragment.
  let lumaDown = readLumaTexture(lumaTexture, lumaTextureSampler, uvDown);
  let lumaUp = readLumaTexture(lumaTexture, lumaTextureSampler, uvUp);
  let lumaLeft = readLumaTexture(lumaTexture, lumaTextureSampler, uvLeft);
  let lumaRight = readLumaTexture(lumaTexture, lumaTextureSampler, uvRight);

  // Find the maximum and minimum luma around the current fragment.
  let lumaMin = min(lumaCenter, min(min(lumaDown, lumaUp), min(lumaLeft, lumaRight)));
  let lumaMax = max(lumaCenter, max(max(lumaDown, lumaUp), max(lumaLeft, lumaRight)));

  // Compute the delta.
  let lumaRange = lumaMax - lumaMin;

  // If the luma variation is lower that a threshold (or if we are in a really dark area), we are not on an edge, don't perform any AA.
  if (lumaRange < max(FXAA_EDGE_THRESHOLD_MIN, lumaMax * FXAA_EDGE_THRESHOLD_MAX)) {
    return uv;
  }

  // Query the 4 remaining corners lumas.
  let lumaDownLeft = readLumaTexture(lumaTexture, lumaTextureSampler, uvLeftDown);
  let lumaUpRight = readLumaTexture(lumaTexture, lumaTextureSampler, uvRightUp);
  let lumaUpLeft = readLumaTexture(lumaTexture, lumaTextureSampler, uvLeftUp);
  let lumaDownRight = readLumaTexture(lumaTexture, lumaTextureSampler, uvRightDown);

  // Combine the four edges lumas (using intermediary variables for future computations with the same values).
  let lumaDownUp = lumaDown + lumaUp;
  let lumaLeftRight = lumaLeft + lumaRight;

  // Same for corners
  let lumaLeftCorners = lumaDownLeft + lumaUpLeft;
  let lumaDownCorners = lumaDownLeft + lumaDownRight;
  let lumaRightCorners = lumaDownRight + lumaUpRight;
  let lumaUpCorners = lumaUpRight + lumaUpLeft;

  // Compute an estimation of the gradient along the horizontal and vertical axis.
  let edgeHorizontal =
    abs(-2.0 * lumaLeft + lumaLeftCorners) +
    abs(-2.0 * lumaCenter + lumaDownUp) * 2.0 +
    abs(-2.0 * lumaRight + lumaRightCorners);
  let edgeVertical =
    abs(-2.0 * lumaUp + lumaUpCorners) +
    abs(-2.0 * lumaCenter + lumaLeftRight) * 2.0 +
    abs(-2.0 * lumaDown + lumaDownCorners);

  // Is the local edge horizontal or vertical?
  let isHorizontal = edgeHorizontal >= edgeVertical;

  // Choose the step size (one pixel) accordingly.
  var stepLength = select(texelSize.x, texelSize.y, isHorizontal);

  // Select the two neighboring texels lumas in the opposite direction to the local edge.
  let luma1 = select(lumaLeft, lumaDown, isHorizontal);
  let luma2 = select(lumaRight, lumaUp, isHorizontal);

  // Compute gradients in this direction.
  let gradient1 = abs(luma1 - lumaCenter);
  let gradient2 = abs(luma2 - lumaCenter);

  // Which direction is the steepest?
  let is1Steepest = gradient1 >= gradient2;

  // Gradient in the corresponding direction, normalized.
  let gradientScaled = 0.25 * max(gradient1, gradient2);

  // Average luma in the correct direction.
  var lumaLocalAverage = 0.0;
  if (is1Steepest) {
    // Switch the direction
    stepLength = -stepLength;
    lumaLocalAverage = 0.5 * (luma1 + lumaCenter);
  } else {
    lumaLocalAverage = 0.5 * (luma2 + lumaCenter);
  }

  // Shift UV in the correct direction by half a pixel.
  var currentUv = uv;
  if (isHorizontal) {
    currentUv.y += stepLength * 0.5;
  } else {
    currentUv.x += stepLength * 0.5;
  }

  // Compute offset (for each iteration step) in the right direction.
  let offset = select(vec2f(0.0, texelSize.y), vec2f(texelSize.x, 0.0), isHorizontal);

  // Compute UVs to explore on each side of the edge, orthogonally. The QUALITY allows us to step faster.
  var uv1 = currentUv - offset; // * QUALITY(0); // (quality 0 is 1.0)
  var uv2 = currentUv + offset; // * QUALITY(0); // (quality 0 is 1.0)

  // Read the lumas at both current extremities of the exploration segment, and compute the delta wrt to the local average luma.
  var lumaEnd1 = readLumaTexture(lumaTexture, lumaTextureSampler, uv1);
  var lumaEnd2 = readLumaTexture(lumaTexture, lumaTextureSampler, uv2);
  lumaEnd1 -= lumaLocalAverage;
  lumaEnd2 -= lumaLocalAverage;

  // If the luma deltas at the current extremities is larger than the local gradient, we have reached the side of the edge.
  var reached1 = abs(lumaEnd1) >= gradientScaled;
  var reached2 = abs(lumaEnd2) >= gradientScaled;
  var reachedBoth = reached1 && reached2;

  // If the side is not reached, we continue to explore in this direction.
  if (!reached1) {
    uv1 -= offset; // * QUALITY(1); // (quality 1 is 1.0)
  }
  if (!reached2) {
    uv2 += offset; // * QUALITY(1); // (quality 1 is 1.0)
  }

  // If both sides have not been reached, continue to explore.
  if (!reachedBoth) {
    for (var i = 2; i < FXAA_ITERATIONS; i++) {
      // If needed, read luma in 1st direction, compute delta.
      if (!reached1) {
        lumaEnd1 = readLumaTexture(lumaTexture, lumaTextureSampler, uv1);
        lumaEnd1 = lumaEnd1 - lumaLocalAverage;
      }
      // If needed, read luma in opposite direction, compute delta.
      if (!reached2) {
        lumaEnd2 = readLumaTexture(lumaTexture, lumaTextureSampler, uv2);
        lumaEnd2 = lumaEnd2 - lumaLocalAverage;
      }
      // If the luma deltas at the current extremities is larger than the local gradient, we have reached the side of the edge.
      reached1 = abs(lumaEnd1) >= gradientScaled;
      reached2 = abs(lumaEnd2) >= gradientScaled;
      reachedBoth = reached1 && reached2;

      // If the side is not reached, we continue to explore in this direction, with a variable quality.
      if (!reached1) {
        uv1 -= offset * FXAA_QUALITY(i);
      }
      if (!reached2) {
        uv2 += offset * FXAA_QUALITY(i);
      }

      // If both sides have been reached, stop the exploration.
      if (reachedBoth) {
        break;
      }
    }
  }

  // Compute the distances to each side edge of the edge (!).
  let distance1 = select(uv.y - uv1.y, uv.x - uv1.x, isHorizontal);
  let distance2 = select(uv2.y - uv.y, uv2.x - uv.x, isHorizontal);

  // In which direction is the side of the edge closer?
  let isDirection1 = distance1 < distance2;
  let distanceFinal = min(distance1, distance2);

  // Thickness of the edge.
  let edgeThickness = distance1 + distance2;

  // Is the luma at center smaller than the local average?
  let isLumaCenterSmaller = lumaCenter < lumaLocalAverage;

  // If the luma at center is smaller than at its neighbour, the delta luma at each end should be positive (same variation).
  // (in the direction of the closer side of the edge.)
  let closestLumaEnd = select(lumaEnd2, lumaEnd1, isDirection1);
  let correctVariation = (closestLumaEnd < 0.0) != isLumaCenterSmaller;

  // UV offset: read in the direction of the closest side of the edge.
  let pixelOffset = -distanceFinal / edgeThickness + 0.5;

  // If the luma variation is incorrect, do not offset.
  var finalOffset = select(0.0, pixelOffset, correctVariation);

  // Sub-pixel shifting
  // Full weighted average of the luma over the 3x3 neighborhood.
  let lumaAverage = FXAA_ONE_OVER_TWELVE * (2.0 * (lumaDownUp + lumaLeftRight) + lumaLeftCorners + lumaRightCorners);
  // Ratio of the delta between the global average and the center luma, over the luma range in the 3x3 neighborhood.
  let subPixelOffset1 = clamp(abs(lumaAverage - lumaCenter) / lumaRange, 0.0, 1.0);
  let subPixelOffset2 = smoothstep(0.0, 1.0, subPixelOffset1);
  // Compute a sub-pixel offset based on this delta.
  let subPixelOffsetFinal = subPixelOffset2 * subPixelOffset2 * subPixelQuality;

  // Pick the biggest of the two offsets.
  finalOffset = max(finalOffset, subPixelOffsetFinal);

  // Compute the final UV coordinates.
  var finalUv = uv;
  if (isHorizontal) {
    finalUv.y += finalOffset * stepLength;
  } else {
    finalUv.x += finalOffset * stepLength;
  }

  return finalUv;
}
`;
