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

// Perspective only: DoF, bilateral blur and motion blur read an orthographic
// camera's depth as perspective, so its linear depth is wrong.
// TODO: pass the projection type and use linearizeDepthZO.
fn readDepth(depths: texture_depth_2d, depthSampler: sampler, uv: vec2f, near: f32, far: f32) -> f32 {
  return linearizeDepthPerspZO(textureSampleLevel(depths, depthSampler, uv, 0), near, far);
}
`;
