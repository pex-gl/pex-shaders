export default /* glsl */ `
// Read depth with different projection:
// https://stackoverflow.com/questions/7777913/how-to-render-depth-linearly-in-modern-opengl-with-gl-fragcoord-z-in-fragment-sh/45710371#45710371

// [0, 1] -> [-1, 1]
float depthBufferValueToNdc(float depth) {
  return 2.0 * depth - 1.0;
}

// http://stackoverflow.com/questions/6652253/getting-the-true-z-value-from-the-depth-buffer
float ndcDepthToEyeSpace(float ndcDepth, float near, float far) {
  return 2.0 * near * far / (far + near - ndcDepth * (far - near));
}

float readDepth(sampler2D depthTexture, vec2 texCoord, float near, float far) {
  return ndcDepthToEyeSpace(
    depthBufferValueToNdc(texture2D(depthTexture, texCoord).r),
    near,
    far
  );
}

// http://www.ogldev.org/www/tutorial47/tutorial47.html
float ndcDepthToEyeSpaceOrtho(float ndcDepth, float near, float far) {
  return (far - near) * (ndcDepth + (far + near) / (far - near)) / 2.0;
}

float readDepthOrtho(sampler2D depthTexture, vec2 texCoord, float near, float far) {
  // return texture2D(depthTexture, texCoord).r * (far - near) + near;
  return ndcDepthToEyeSpaceOrtho(
    depthBufferValueToNdc(texture2D(depthTexture, texCoord).r),
    near,
    far
  );
}
`;
