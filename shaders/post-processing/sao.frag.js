import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uDepthTexture;
uniform sampler2D uNormalTexture;
uniform vec2 uViewportSize;

uniform sampler2D uNoiseTexture;
uniform float uNear;
uniform float uFar;
uniform float uFov;

uniform float uIntensity; // Darkending factor
uniform float uRadius; // World-space AO radius in scene units (r).  e.g., 1.0m
uniform float uBias; // Bias to avoid AO in smooth corners, e.g., 0.01m
uniform float uBrightness;
uniform float uContrast;
// uniform vec2 uNoiseScale;
vec2 uNoiseScale = vec2(10.0);

// Includes
${SHADERS.math.random}
${SHADERS.math.TWO_PI}
${SHADERS.depthRead}
${SHADERS.depthPosition}
${SHADERS.colorCorrection}

// SAO (Scalable Ambient Obscurance)
// https://research.nvidia.com/publication/2012-06_scalable-ambient-obscurance
// https://casual-effects.com/research/McGuire2012SAO/index.html
// Based on https://gist.github.com/transitive-bullshit/6770311
// Updated by marcin.ignac@gmail.com 2017-05-08

// Total number of direct samples to take at each pixel
// #define NUM_SAMPLES 11
#define NUM_SPIRAL_TURNS 7
#define VARIATION 1

const float NUM_SAMPLES_FLOAT = float(NUM_SAMPLES);
const float INV_NUM_SAMPLES_FLOAT = 1.0 / NUM_SAMPLES_FLOAT;
const float NUM_SPIRAL_TURNS_TIMES_TWO_PI_FLOAT = float(NUM_SPIRAL_TURNS) * TWO_PI;

vec3 getPositionVS(vec2 uv) {
  return reconstructPositionFromDepth(uv, readDepth(uDepthTexture, uv, uNear, uFar));
}

// Returns a unit vector and a screen-space radius for the tap on a unit disk (the caller should scale by the actual disk radius)
vec2 tapLocation(int sampleNumber, float spinAngle, out float radiusSS) {
  // Radius relative to radiusSS
  float alpha = (float(sampleNumber) + 0.5) * INV_NUM_SAMPLES_FLOAT;
  float angle = alpha * (NUM_SPIRAL_TURNS_TIMES_TWO_PI_FLOAT) + spinAngle;

  radiusSS = alpha;
  return vec2(cos(angle), sin(angle));
}

vec3 getOffsetPositionVS(vec2 uv, vec2 unitOffset, float radiusSS) {
  uv = uv + radiusSS * unitOffset * (1.0 / uViewportSize);
  return getPositionVS(uv);
}

float sampleAO(vec2 uv, vec3 positionVS, vec3 normalVS, float sampleRadiusSS, int tapIndex, float rotationAngle, float radius2) {
  const float epsilon = 0.01;

	// Offset on the unit disk, spun for this pixel
  float radiusSS = 0.0;
  vec2 unitOffset = tapLocation(tapIndex, rotationAngle, radiusSS);
  radiusSS *= sampleRadiusSS;

	// The occluding point in camera space
  vec3 Q = getOffsetPositionVS(uv, unitOffset, radiusSS);
  vec3 v = Q - positionVS;

  float vv = dot(v, v);
  float vn = dot(v, normalVS) - uBias;

#if VARIATION == 0
  // A: From the HPG12 paper
  // Note large epsilon to avoid overdarkening within cracks
  return float(vv < radius2) * max((vn - bias) / (epsilon + vv), 0.0) * radius2 * 0.6;
  // return float(vv < radius2) * max(vn / (epsilon + vv), 0.0);
#elif VARIATION == 1 // default / recommended
  // B: Smoother transition to zero (lowers contrast, smoothing out corners). [Recommended]
  // float f = max(radius2 - vv, 0.0);
  float f = max(radius2 - vv, 0.0) / radius2;
  return f * f * f * max((vn) / (epsilon + vv), 0.0);
#elif VARIATION == 2
  // C: Medium contrast (which looks better at high radii), no division.  Note that the
  // contribution still falls off with radius^2, but we've adjusted the rate in a way that is
  // more computationally efficient and happens to be aesthetically pleasing.
  float invRadius2 = 1.0 / radius2;
  return 4.0 * max(1.0 - vv * invRadius2, 0.0) * max(vn, 0.0);
#else
  // D: Low contrast, no division operation
  return 2.0 * float(vv < radius2) * max(vn, 0.0);
#endif
}

void main() {
  float occlusion = 0.0;

  vec2 vUV = gl_FragCoord.xy / uViewportSize;
  vec3 originVS = getPositionVS(vUV);

  float depth = clamp(smoothstep(uNear, uFar, -originVS.z), 0.0, 1.0);

  if (depth >= 1.0) {
    occlusion = 1.0;
  } else {
    vec3 normalVS = texture2D(uNormalTexture, vUV).rgb * 2.0 - 1.0;

    float sampleNoise = texture2D(uNoiseTexture, vUV * uNoiseScale).r;

    // float randomPatternRotationAngle = 2.0 * PI * sampleNoise.x;
    float randomPatternRotationAngle = rand(gl_FragCoord.xy) * TWO_PI * sampleNoise;

    float projScale = 1.0 / (2.0 * tan(uFov * 0.5));

    float radius2 = uRadius * uRadius;
    float radiusSS = projScale * uRadius / originVS.z; // radius of influence in screen space

    for (int i = 0; i < NUM_SAMPLES; ++i) {
      occlusion += sampleAO(vUV, originVS, normalVS, radiusSS, i, randomPatternRotationAngle, radius2);
    }

    occlusion = 1.0 - occlusion / (4.0 * NUM_SAMPLES_FLOAT);
    occlusion = clamp(pow(occlusion, 1.0 + uIntensity), 0.0, 1.0);
  }

  // Brightness/contrast adjust
  // TODO: threshold? otherwise everything gets darker
  occlusion = clamp(brightnessContrast(occlusion, uBrightness, uContrast), 0.0, 1.0);

  gl_FragColor = vec4(occlusion, 0.0, 0.0, 1.0);

  ${SHADERS.output.assignment}
}
`;
