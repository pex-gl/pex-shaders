import { PCF, PCFCube } from "./pcf.js";
import { PCSSCommon, PCSS, PCSSCube } from "./pcss.js";

// Modern shadowing: depth textures sampled with a comparison sampler (2D) for
// hardware PCF, or a regular sampler (cube, manual compare). `compare` is the
// receiver's clip-space [0, 1] depth in the light projection; slope-scaled depth
// bias is applied by the shadow pass rasterizer, not here. Requires depth-read
// (linearizeDepthZO), TWO_PI and the PBR PCF/PCSS chunks.
export default /* wgsl */ `
${PCSSCommon}

override SHADOW_QUALITY: i32 = 3;
override SHADOW_NORMAL_OFFSET: f32 = 2.0;

// Normal-offset bias: shift the shadow lookup off the receiver surface along its
// world normal by a few shadow texels before projecting into the light. It needs
// no screen-space derivatives, so unlike the receiver-plane bias it stays valid
// where the *camera* grazes the receiver — exactly where that derivative-based
// bias degenerates and acne appears. The offset grows as the *light* direction
// gets tangent (larger depth slope to hide). texelWorldSize is one shadow texel
// in world units at the receiver.
fn normalOffsetBias(positionWorld: vec3f, normalWorld: vec3f, NdotL: f32, texelWorldSize: f32) -> vec3f {
  let slope = clamp(1.0 - NdotL, 0.0, 1.0);
  return positionWorld + normalWorld * (texelWorldSize * SHADOW_NORMAL_OFFSET * (1.0 + slope));
}

${PCF}
${PCSS}

fn getShadow(
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
  // SHADOW_QUALITY is an override (uniform across the draw), so branching on it
  // alone keeps derivative-free comparison sampling out of non-uniform flow.
  var result = 1.0;
  if (SHADOW_QUALITY == 1 || SHADOW_QUALITY == 2) {
    result = texture2DCompare(depths, depthSampler, uv, compare);
  } else if (SHADOW_QUALITY == 3) {
    result = PCF3x3(depths, depthSampler, size, uv, compare);
  } else if (SHADOW_QUALITY == 4) {
    result = PCF5x5(depths, depthSampler, size, uv, compare);
  } else if (SHADOW_QUALITY == 5) {
    result = PCSS(depths, depthSampler, size, uv, compare, near, far, radiusUV, dzDuv, ortho, fragCoord);
  }

  // Outside the shadow frustum (uv or depth beyond [0, 1]) there is no occluder
  // information: treat as lit rather than shadowed.
  let inBounds =
    uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0 &&
    compare >= 0.0 && compare <= 1.0;
  return select(1.0, result, inBounds);
}

${PCFCube}
${PCSSCube}

fn getPunctualShadow(
  depths: texture_depth_cube,
  depthSampler: sampler,
  size: vec2f,
  direction: vec3f,
  compare: f32,
  radius: f32,
  far: f32,
  fragCoord: vec2f
) -> f32 {
  // Beyond the cube far plane there is no occluder information: treat as lit.
  if (SHADOW_QUALITY == 0 || compare >= 1.0) {
    return 1.0;
  }
  if (SHADOW_QUALITY == 1 || SHADOW_QUALITY == 2) {
    return textureCubeCompare(depths, depthSampler, direction, compare);
  }
  if (SHADOW_QUALITY == 3 || SHADOW_QUALITY == 4) {
    return PCFCube(depths, depthSampler, size, direction, compare);
  }
  if (SHADOW_QUALITY == 5) {
    return PCSSCube(depths, depthSampler, direction, compare, radius, far, fragCoord);
  }
  return 1.0;
}
`;
