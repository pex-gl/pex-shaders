// Linearize a [0, 1] clip-space depth (WebGPU zero-to-one convention, near at 0)
// to a positive eye-space distance. The near/far forms serve PCSS penumbra
// estimation, where the shadow projection type is known and the mapping is
// conventional; camera depth is reversed-Z and goes through the inverse
// projection instead, which carries either convention.
export default /* wgsl */ `
fn linearizeDepthOrthoZO(d: f32, near: f32, far: f32) -> f32 {
  return near + d * (far - near);
}

fn linearizeDepthPerspZO(d: f32, near: f32, far: f32) -> f32 {
  return near * far / (far - d * (far - near));
}

fn linearizeDepthZO(d: f32, near: f32, far: f32, ortho: bool) -> f32 {
  if (ortho) {
    return linearizeDepthOrthoZO(d, near, far);
  }
  return linearizeDepthPerspZO(d, near, far);
}

// Finite stand-in for the background of an infinite far plane, whose linear
// depth is +inf. Far past any scene distance, and small enough that a view
// position at this depth can still be squared in f32.
const DEPTH_MAX: f32 = 1e9;

// Perspective, orthographic, zoomed, off-axis and infinite far alike: view z and
// w depend on clip z and w only, so the x and y columns drop out. Clamped to
// DEPTH_MAX without dividing by the zero w of an infinite far plane's background.
// A finite far plane's background reads as far.
fn linearizeDepth(depth: f32, inverseProjectionMatrix: mat4x4f) -> f32 {
  let view = inverseProjectionMatrix[2].zw * depth + inverseProjectionMatrix[3].zw;
  return -view.x / max(view.y, -view.x / DEPTH_MAX);
}

fn readDepth(depths: texture_depth_2d, depthSampler: sampler, uv: vec2f, inverseProjectionMatrix: mat4x4f) -> f32 {
  return linearizeDepth(textureSampleLevel(depths, depthSampler, uv, 0), inverseProjectionMatrix);
}
`;
