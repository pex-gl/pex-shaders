/**
 * FXAA
 *
 * Paper:
 * - https://developer.download.nvidia.com/assets/gamedev/files/sdk/11/FXAA_WhitePaper.pdf
 *
 * Reference Implementations:
 * - v3.11: https://github.com/FyroxEngine/Fyrox/blob/master/src/renderer/shaders/fxaa_fs.glsl
 * - v2: https://github.com/mattdesl/glsl-fxaa
 *
 * Updates: Damien Seguin (2023-10)
 * @alias module:chunks.fxaa
 * @type {string}
 */
export default /* glsl */ `
// TODO: precompute luma in color attachment
// TODO: don't apply where there is strong motion blur or depth of field.
// TODO: threshold settings

#if defined(USE_FXAA_2) || defined(USE_FXAA_3)

  varying vec2 vTexCoord0LeftUp;
  varying vec2 vTexCoord0RightUp;
  varying vec2 vTexCoord0LeftDown;
  varying vec2 vTexCoord0RightDown;

  vec3 readTextureLDR(sampler2D tex, vec2 uv) {
    return reinhard(texture2D(tex, uv).xyz);
  }
  vec4 readTextureLDR3(sampler2D tex, vec2 uv) {
    return vec4(reinhard(texture2D(tex, uv).xyz), 1.0);
  }
  // Approximation for linear color
  float rgbToLuma(vec3 rgb){
    return sqrt(luma(rgb));
  }

  #ifdef USE_FXAA_3
    // Low
    // #define FXAA_EDGE_THRESHOLD_MIN 0.0833 // 1 / 12
    // #define FXAA_EDGE_THRESHOLD_MAX 0.250 // 1 / 4

    // Medium
    // #define FXAA_EDGE_THRESHOLD_MIN 0.0625; // 1 / 16
    // #define FXAA_EDGE_THRESHOLD_MAX 0.166; // 1 / 6

    // High
    // #define FXAA_EDGE_THRESHOLD_MIN 0.0312 // 1 / 32
    // #define FXAA_EDGE_THRESHOLD_MAX 0.125 // 1 / 8

    // Ultra
    // #define FXAA_EDGE_THRESHOLD_MIN 0.0156 // 1 / 64
    // #define FXAA_EDGE_THRESHOLD_MAX 0.063 // 1 / 16

    // Extreme
    #define FXAA_EDGE_THRESHOLD_MIN 0.0078 // 1 / 128
    #define FXAA_EDGE_THRESHOLD_MAX 0.031 // 1 / 32

    #define FXAA_QUALITY(q) ((q) < 5 ? 1.0 : ((q) > 5 ? ((q) < 10 ? 2.0 : ((q) < 11 ? 4.0 : 8.0)) : 1.5))
    #define FXAA_ITERATIONS 12

    // FXAA blends anything that has high enough contrast. It helps mitigate fireflies but will blur small details.
    // - 1.00: upper limit (softer)
    // - 0.75: default amount of filtering
    // - 0.50: lower limit (sharper, less sub-pixel aliasing removal)
    // - 0.25: almost off
    // - 0.00: completely off
    #define FXAA_SUBPIXEL_QUALITY 0.75

    #define FXAA_ONE_OVER_TWELVE 1.0 / 12.0

    varying vec2 vTexCoord0Down;
    varying vec2 vTexCoord0Up;
    varying vec2 vTexCoord0Left;
    varying vec2 vTexCoord0Right;

    // Performs FXAA post-process anti-aliasing as described in the Nvidia FXAA white paper and the associated shader code.
    vec4 fxaa3(sampler2D screenTexture, vec2 texCoord, vec2 resolution) {
      vec2 texelSize = 1.0 / resolution;

      // vec4 colorCenter = texture2D(screenTexture, texCoord);
      vec4 colorCenter = readTextureLDR3(screenTexture, texCoord);

      // Luma at the current fragment
      float lumaCenter = rgbToLuma(colorCenter.rgb);

      // Luma at the four direct neighbours of the current fragment.
      float lumaDown = rgbToLuma(readTextureLDR(screenTexture, vTexCoord0Down));
      float lumaUp = rgbToLuma(readTextureLDR(screenTexture, vTexCoord0Up));
      float lumaLeft = rgbToLuma(readTextureLDR(screenTexture, vTexCoord0Left));
      float lumaRight = rgbToLuma(readTextureLDR(screenTexture, vTexCoord0Right));

      // Find the maximum and minimum luma around the current fragment.
      float lumaMin = min(lumaCenter, min(min(lumaDown, lumaUp), min(lumaLeft, lumaRight)));
      float lumaMax = max(lumaCenter, max(max(lumaDown, lumaUp), max(lumaLeft, lumaRight)));

      // Compute the delta.
      float lumaRange = lumaMax - lumaMin;

      // If the luma variation is lower that a threshold (or if we are in a really dark area), we are not on an edge, don't perform any AA.
      if (lumaRange < max(FXAA_EDGE_THRESHOLD_MIN, lumaMax * FXAA_EDGE_THRESHOLD_MAX)) {
        return colorCenter;
      }

      // Query the 4 remaining corners lumas.
      float lumaDownLeft = rgbToLuma(readTextureLDR(screenTexture, vTexCoord0LeftDown));
      float lumaUpRight = rgbToLuma(readTextureLDR(screenTexture, vTexCoord0RightUp));
      float lumaUpLeft = rgbToLuma(readTextureLDR(screenTexture, vTexCoord0LeftUp));
      float lumaDownRight = rgbToLuma(readTextureLDR(screenTexture, vTexCoord0RightDown));

      // Combine the four edges lumas (using intermediary variables for future computations with the same values).
      float lumaDownUp = lumaDown + lumaUp;
      float lumaLeftRight = lumaLeft + lumaRight;

      // Same for corners
      float lumaLeftCorners = lumaDownLeft + lumaUpLeft;
      float lumaDownCorners = lumaDownLeft + lumaDownRight;
      float lumaRightCorners = lumaDownRight + lumaUpRight;
      float lumaUpCorners = lumaUpRight + lumaUpLeft;

      // Compute an estimation of the gradient along the horizontal and vertical axis.
      float edgeHorizontal =
        abs(-2.0 * lumaLeft + lumaLeftCorners) +
        abs(-2.0 * lumaCenter + lumaDownUp) * 2.0 +
        abs(-2.0 * lumaRight + lumaRightCorners);
      float edgeVertical =
        abs(-2.0 * lumaUp + lumaUpCorners) +
        abs(-2.0 * lumaCenter + lumaLeftRight) * 2.0 +
        abs(-2.0 * lumaDown + lumaDownCorners);

      // Is the local edge horizontal or vertical ?
      bool isHorizontal = (edgeHorizontal >= edgeVertical);

      // Choose the step size (one pixel) accordingly.
      float stepLength = isHorizontal ? texelSize.y : texelSize.x;

      // Select the two neighboring texels lumas in the opposite direction to the local edge.
      float luma1 = isHorizontal ? lumaDown : lumaLeft;
      float luma2 = isHorizontal ? lumaUp : lumaRight;

      // Compute gradients in this direction.
      float gradient1 = abs(luma1 - lumaCenter);
      float gradient2 = abs(luma2 - lumaCenter);

      // Which direction is the steepest ?
      bool is1Steepest = gradient1 >= gradient2;

      // Gradient in the corresponding direction, normalized.
      float gradientScaled = 0.25 * max(gradient1, gradient2);

      // Average luma in the correct direction.
      float lumaLocalAverage = 0.0;
      if (is1Steepest) {
        // Switch the direction
        stepLength = - stepLength;
        lumaLocalAverage = 0.5 * (luma1 + lumaCenter);
      } else {
        lumaLocalAverage = 0.5 * (luma2 + lumaCenter);
      }

      // Shift UV in the correct direction by half a pixel.
      vec2 currentUv = texCoord;
      if (isHorizontal){
        currentUv.y += stepLength * 0.5;
      } else {
        currentUv.x += stepLength * 0.5;
      }

      // Compute offset (for each iteration step) in the right direction.
      vec2 offset = isHorizontal ? vec2(texelSize.x, 0.0) : vec2(0.0, texelSize.y);

      // Compute UVs to explore on each side of the edge, orthogonally. The QUALITY allows us to step faster.
      vec2 uv1 = currentUv - offset; // * QUALITY(0); // (quality 0 is 1.0)
      vec2 uv2 = currentUv + offset; // * QUALITY(0); // (quality 0 is 1.0)

      // Read the lumas at both current extremities of the exploration segment, and compute the delta wrt to the local average luma.
      float lumaEnd1 = rgbToLuma(readTextureLDR(screenTexture, uv1));
      float lumaEnd2 = rgbToLuma(readTextureLDR(screenTexture, uv2));
      lumaEnd1 -= lumaLocalAverage;
      lumaEnd2 -= lumaLocalAverage;

      // If the luma deltas at the current extremities is larger than the local gradient, we have reached the side of the edge.
      bool reached1 = abs(lumaEnd1) >= gradientScaled;
      bool reached2 = abs(lumaEnd2) >= gradientScaled;
      bool reachedBoth = reached1 && reached2;

      // If the side is not reached, we continue to explore in this direction.
      if (!reached1){
        uv1 -= offset; // * QUALITY(1); // (quality 1 is 1.0)
      }
      if (!reached2){
        uv2 += offset; // * QUALITY(1); // (quality 1 is 1.0)
      }

      // If both sides have not been reached, continue to explore.
      if (!reachedBoth)
      {
        for (int i = 2; i < FXAA_ITERATIONS; i++)
        {
          // If needed, read luma in 1st direction, compute delta.
          if (!reached1) {
            lumaEnd1 = rgbToLuma(readTextureLDR(screenTexture, uv1));
            lumaEnd1 = lumaEnd1 - lumaLocalAverage;
          }
          // If needed, read luma in opposite direction, compute delta.
          if (!reached2) {
            lumaEnd2 = rgbToLuma(readTextureLDR(screenTexture, uv2));
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
      float distance1 = isHorizontal ? (texCoord.x - uv1.x) : (texCoord.y - uv1.y);
      float distance2 = isHorizontal ? (uv2.x - texCoord.x) : (uv2.y - texCoord.y);

      // In which direction is the side of the edge closer ?
      bool isDirection1 = distance1 < distance2;
      float distanceFinal = min(distance1, distance2);

      // Thickness of the edge.
      float edgeThickness = (distance1 + distance2);

      // Is the luma at center smaller than the local average ?
      bool isLumaCenterSmaller = lumaCenter < lumaLocalAverage;

      // If the luma at center is smaller than at its neighbour, the delta luma at each end should be positive (same variation).
      bool correctVariation1 = (lumaEnd1 < 0.0) != isLumaCenterSmaller;
      bool correctVariation2 = (lumaEnd2 < 0.0) != isLumaCenterSmaller;

      // Only keep the result in the direction of the closer side of the edge.
      bool correctVariation = isDirection1 ? correctVariation1 : correctVariation2;

      // UV offset: read in the direction of the closest side of the edge.
      float pixelOffset = - distanceFinal / edgeThickness + 0.5;

      // If the luma variation is incorrect, do not offset.
      float finalOffset = correctVariation ? pixelOffset : 0.0;

      // Sub-pixel shifting
      // Full weighted average of the luma over the 3x3 neighborhood.
      float lumaAverage = FXAA_ONE_OVER_TWELVE * (2.0 * (lumaDownUp + lumaLeftRight) + lumaLeftCorners + lumaRightCorners);
      // Ratio of the delta between the global average and the center luma, over the luma range in the 3x3 neighborhood.
      float subPixelOffset1 = clamp(abs(lumaAverage - lumaCenter) / lumaRange, 0.0, 1.0);
      float subPixelOffset2 = (-2.0 * subPixelOffset1 + 3.0) * subPixelOffset1 * subPixelOffset1;
      // Compute a sub-pixel offset based on this delta.
      float subPixelOffsetFinal = subPixelOffset2 * subPixelOffset2 * FXAA_SUBPIXEL_QUALITY;

      // Pick the biggest of the two offsets.
      finalOffset = max(finalOffset, subPixelOffsetFinal);

      // Compute the final UV coordinates.
      vec2 finalUv = texCoord;
      if (isHorizontal){
        finalUv.y += finalOffset * stepLength;
      } else {
        finalUv.x += finalOffset * stepLength;
      }

      // Read the color at the new UV coordinates, and use it.
      return readTextureLDR3(screenTexture, finalUv);
    }
  #endif
  #ifdef USE_FXAA_2
    uniform float uFXAASpanMax;

    #define FXAA_REDUCE_MIN (1.0 / 128.0)
    #define FXAA_REDUCE_MUL (1.0 / 8.0)

    #define FXAA_ONE_OVER_THREE 1.0 / 3.0
    #define FXAA_TWO_OVER_THREE 2.0 / 3.0

    vec4 fxaa2(sampler2D tex, vec2 texCoord, vec2 resolution) {
      vec2 texelSize = 1.0 / resolution;

      vec4 texColor = texture2D(tex, texCoord);

      float lumaNW = rgbToLuma(readTextureLDR(tex, vTexCoord0LeftUp));
      float lumaNE = rgbToLuma(readTextureLDR(tex, vTexCoord0RightUp));
      float lumaSW = rgbToLuma(readTextureLDR(tex, vTexCoord0LeftDown));
      float lumaSE = rgbToLuma(readTextureLDR(tex, vTexCoord0RightDown));
      float lumaCenter  = rgbToLuma(reinhard(texColor.xyz));

      float lumaMin = min(lumaCenter, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
      float lumaMax = max(lumaCenter, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

      mediump vec2 dir = vec2(
        -((lumaNW + lumaNE) - (lumaSW + lumaSE)),
        ((lumaNW + lumaSW) - (lumaNE + lumaSE))
      );

      float dirReduce = max(
        (lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL),
        FXAA_REDUCE_MIN
      );
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = min(
        vec2(uFXAASpanMax, uFXAASpanMax),
        max(
          vec2(-uFXAASpanMax, -uFXAASpanMax),
          dir * rcpDirMin
        )
      ) * texelSize;

      vec3 rgbA = 0.5 * (
        readTextureLDR(tex, texCoord + dir * (FXAA_ONE_OVER_THREE - 0.5)) +
        readTextureLDR(tex, texCoord + dir * (FXAA_TWO_OVER_THREE - 0.5))
      );
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        readTextureLDR(tex, texCoord + dir * -0.5) +
        readTextureLDR(tex, texCoord + dir * 0.5)
      );

      float lumaB = rgbToLuma(rgbB);
      if ((lumaB < lumaMin) || (lumaB > lumaMax)) return vec4(rgbA, texColor.a);
      return vec4(rgbB, texColor.a);
    }
  #endif
#endif
`;
