// Linearize a [0, 1] clip-space depth (WebGPU zero-to-one convention) to a
// positive eye-space distance, for PCSS penumbra estimation. Orthographic depth
// is already linear; perspective is not.
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

// Post-processing effects (SSAO, DoF, bilateral blur) always read the main
// camera's depth buffer, which is perspective.
fn readDepth(depths: texture_depth_2d, depthSampler: sampler, uv: vec2f, near: f32, far: f32) -> f32 {
  return linearizeDepthPerspZO(textureSampleLevel(depths, depthSampler, uv, 0), near, far);
}
`;
