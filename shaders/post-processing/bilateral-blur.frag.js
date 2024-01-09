import * as SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform sampler2D uDepthTexture;
uniform vec2 uViewportSize;

uniform float uNear;
uniform float uFar;

uniform vec2 uDirection;
uniform float uSharpness;

${SHADERS.depthRead}

// Blur weight based on https://github.com/nvpro-samples/gl_ssao/blob/master/hbao_blur.frag.glsl
// const int numSamples = 9;
// const float blurRadius = float(numSamples) / 2.0;
// const float blurSigma = blurRadius * 0.5;
// const float blurFalloff = 1.0 / (2.0*blurSigma*blurSigma);
const float blurFalloff = 0.09876543210;

vec4 bilateralBlur(sampler2D image, vec2 imageResolution, sampler2D depthTexture, vec2 uv, vec2 direction) {
  vec4 color = vec4(0.0);

  float centerDepth = readDepth(depthTexture, uv, uNear, uFar);

  float weightSum = 0.0;

  for (float i = -8.0; i <= 8.0; i += 2.0) {
    float r = i;
    vec2 off = direction * r;
    float sampleDepth = readDepth(depthTexture, uv + (off / imageResolution), uNear, uFar);
    float diff = (sampleDepth - centerDepth) * uSharpness;
    float weight = exp2(-r * r * blurFalloff - diff * diff);
    weightSum += weight;
    color += texture2D(image, uv + (off / imageResolution)) * weight;
  }

  color /= weightSum;

  return color;
}

void main() {
  vec2 vUV = gl_FragCoord.xy / uViewportSize;
  gl_FragColor = bilateralBlur(uTexture, uViewportSize, uDepthTexture, vUV, uDirection);

  ${SHADERS.output.assignment}
}
`;
