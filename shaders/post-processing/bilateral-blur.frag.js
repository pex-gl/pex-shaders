import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

varying vec2 vTexCoord;

uniform sampler2D uDepthTexture;
uniform vec2 uDepthTextureSize;

uniform float near;
uniform float far;

uniform sampler2D image;
uniform vec2 imageSize;

uniform vec2 direction;

uniform float sharpness;

${SHADERS.depthRead}

//blur weight based on https://github.com/nvpro-samples/gl_ssao/blob/master/hbao_blur.frag.glsl
vec4 bilateralBlur(sampler2D image, vec2 imageResolution, sampler2D uDepthTexture, vec2 uDepthTextureResolution, vec2 uv, vec2 direction) {
  vec4 color = vec4(0.0);
  const int numSamples = 9;
  const float blurRadius = float(numSamples) / 2.0;
  const float blurSigma = blurRadius * 0.5;
  const float blurFalloff = 1.0 / (2.0*blurSigma*blurSigma);

  float centerDepth = readDepth(uDepthTexture, uv, near, far);
  float dist = 0.0;

  float weightSum = 0.0;
  for (float i = -8.0; i <= 8.0; i += 2.0) {
    float r = i;
    vec2 off = direction * r;
    float sampleDepth = readDepth(uDepthTexture, uv + (off / imageResolution), near, far);
    float diff = (sampleDepth - centerDepth) * sharpness;
    float weight = exp2(-r * r * blurFalloff - diff * diff);
    weightSum += weight;
    color += texture2D(image, uv + (off / imageResolution)) * weight;
  }
  color /= weightSum;
  return color;
}

void main() {
  vec2 vUV = vec2(gl_FragCoord.x / uDepthTextureSize.x, gl_FragCoord.y / uDepthTextureSize.y);
  gl_FragColor = bilateralBlur(image, imageSize, uDepthTexture, uDepthTextureSize, vUV, direction);

  ${SHADERS.output.assignment}
}
`;
