import { PCF, PCFCube } from "./pcf.js";
import { PCSSCommon, PCSS, PCSSCube } from "./pcss.js";

export default /* wgsl */ `
const DEPTH_TOLERANCE: f32 = 0.001;

${PCSSCommon}

override SHADOW_QUALITY: i32 = 3;

${PCF}
${PCSS}

fn getShadow(
  depths: texture_2d<f32>,
  depthSampler: sampler,
  size: vec2f,
  uv: vec2f,
  compare: f32,
  near: f32,
  far: f32,
  ndcLightZ: f32,
  radiusUV: vec2f,
  ortho: bool,
  fragCoord: vec2f
) -> f32 {
  // The out-of-bounds check is applied as a mask at the end rather than as an
  // early return: \`uv\` is a non-uniform (per-fragment) value, and an early
  // return based on it would put every SHADOW_QUALITY branch - including
  // PCSS's dpdx/dpdy call - downstream of non-uniform control flow, which
  // WGSL forbids for derivative-dependent builtins. SHADOW_QUALITY itself is
  // an override (uniform across the whole draw), so branching on it alone is
  // safe.
  var result = 1.0;
  if (SHADOW_QUALITY == 1) {
    result = texture2DCompare(depths, depthSampler, uv, compare, near, far, ortho);
  } else if (SHADOW_QUALITY == 2) {
    result = texture2DShadowLerp(depths, depthSampler, size, uv, compare, near, far, ortho);
  } else if (SHADOW_QUALITY == 3) {
    result = PCF3x3(depths, depthSampler, size, uv, compare, near, far, ortho);
  } else if (SHADOW_QUALITY == 4) {
    result = PCF5x5(depths, depthSampler, size, uv, compare, near, far, ortho);
  } else if (SHADOW_QUALITY == 5) {
    result = PCSS(depths, depthSampler, size, uv, compare, near, far, ndcLightZ, radiusUV, ortho, fragCoord);
  }

  let inBounds = uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
  return select(1.0, result, inBounds);
}

${PCFCube}
${PCSSCube}

fn getPunctualShadow(
  depths: texture_cube<f32>,
  depthSampler: sampler,
  size: vec2f,
  direction: vec3f,
  compare: f32,
  radius: f32,
  fragCoord: vec2f
) -> f32 {
  if (SHADOW_QUALITY == 0) {
    return 1.0;
  }
  if (SHADOW_QUALITY == 1 || SHADOW_QUALITY == 2) {
    return textureCubeCompare(depths, depthSampler, direction, compare);
  }
  if (SHADOW_QUALITY == 3 || SHADOW_QUALITY == 4) {
    return PCFCube(depths, depthSampler, size, direction, compare);
  }
  if (SHADOW_QUALITY == 5) {
    return PCSSCube(depths, depthSampler, size, direction, compare, radius, fragCoord);
  }
  return 1.0;
}
`;
