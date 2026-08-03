// Read depth with different projection: https://stackoverflow.com/questions/7777913/how-to-render-depth-linearly-in-modern-opengl-with-gl-fragcoord-z-in-fragment-sh/45710371#45710371
// depthBufferValueToNdc: remap [0, 1] -> [-1, 1]
// ndcDepthToEyeSpace: http://stackoverflow.com/questions/6652253/getting-the-true-z-value-from-the-depth-buffer
// ndcDepthToEyeSpaceOrtho: http://www.ogldev.org/www/tutorial47/tutorial47.html
export default /* wgsl */ `
fn depthBufferValueToNdc(depth: f32) -> f32 {
  return 2.0 * depth - 1.0;
}

fn ndcDepthToEyeSpace(ndcDepth: f32, near: f32, far: f32) -> f32 {
  return 2.0 * near * far / (far + near - ndcDepth * (far - near));
}

fn readDepth(depthTexture: texture_2d<f32>, depthSampler: sampler, texCoord: vec2f, near: f32, far: f32) -> f32 {
  return ndcDepthToEyeSpace(
    depthBufferValueToNdc(textureSampleLevel(depthTexture, depthSampler, texCoord, 0.0).x),
    near,
    far
  );
}

fn ndcDepthToEyeSpaceOrtho(ndcDepth: f32, near: f32, far: f32) -> f32 {
  return (far - near) * (ndcDepth + (far + near) / (far - near)) / 2.0;
}

fn readDepthOrtho(depthTexture: texture_2d<f32>, depthSampler: sampler, texCoord: vec2f, near: f32, far: f32) -> f32 {
  return ndcDepthToEyeSpaceOrtho(
    depthBufferValueToNdc(textureSampleLevel(depthTexture, depthSampler, texCoord, 0.0).x),
    near,
    far
  );
}
`;
