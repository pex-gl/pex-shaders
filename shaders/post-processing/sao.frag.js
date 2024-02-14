import * as SHADERS from "../chunks/index.js";

/**
 * SAO (Scalable Ambient Obscurance)
 *
 * Paper: https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf
 * (https://casual-effects.com/research/McGuire2012SAO/index.html)
 *
 * Reference Implementation: https://gist.github.com/transitive-bullshit/6770311
 *
 * Updates: Marcin Ignac (2017-05-08) and Damien Seguin (2023-10)
 * @alias module:postProcessing.sao.frag
 * @type {string}
 */
export default /* glsl */ `
precision highp float;

// Required defines:
// Number of direct samples to take at each pixel:
// NUM_SAMPLES 11
// Number of turns around the circle that the spiral pattern makes (should be
// prime number to prevent taps from lining up):
// NUM_SPIRAL_TURNS 7

// Optional defines:
// USE_NOISE_TEXTURE

${SHADERS.output.frag}

uniform sampler2D uDepthTexture;
uniform sampler2D uNormalTexture;
uniform vec2 uViewportSize;
uniform vec2 uTexelSize;

#ifdef USE_NOISE_TEXTURE
  uniform sampler2D uNoiseTexture;
  uniform float uNoiseTextureSize;
#endif

uniform float uNear;
uniform float uFar;
uniform float uFov;

uniform float uIntensity; // Darkening factor
uniform float uRadius; // World-space AO radius in scene units (r).  e.g., 1.0m
uniform float uBias; // Bias to avoid AO in smooth corners, e.g., 0.01m
uniform float uBrightness;
uniform float uContrast;

// Includes
${SHADERS.math.saturate}
${SHADERS.math.random}
${SHADERS.math.TWO_PI}
${SHADERS.depthRead}
${SHADERS.depthPosition}
${SHADERS.colorCorrection}

const float RADIUS_MULTIPLIER = 500.0;
const float EPSILON = 0.01;

const float NUM_SAMPLES_FLOAT = float(NUM_SAMPLES);
const float INV_NUM_SAMPLES = 1.0 / NUM_SAMPLES_FLOAT;
const float NUM_SPIRAL_TURNS_TIMES_TWO_PI = float(NUM_SPIRAL_TURNS) * TWO_PI;

vec3 getPositionView(vec2 uv) {
  return reconstructPositionFromDepth(uv, readDepth(uDepthTexture, uv, uNear, uFar));
}

vec3 getOffsetPositionView(vec2 uv, vec2 unitOffset, float radiusScreen) {
  return getPositionView(uv + radiusScreen * unitOffset * uTexelSize);
}

// Returns a unit vector and a screen-space radius for the tap on a unit disk (the caller should scale by the actual disk radius)
vec2 tapLocation(int sampleNumber, float spinAngle, out float radiusScreen) {
  // Radius relative to radiusScreen
  float alpha = (float(sampleNumber) + 0.5) * INV_NUM_SAMPLES;
  float angle = alpha * (NUM_SPIRAL_TURNS_TIMES_TWO_PI) + spinAngle;

  radiusScreen = alpha;
  return vec2(cos(angle), sin(angle));
}

float sampleAO(vec2 uv, vec3 positionView, vec3 normalView, float sampleRadiusScreen, int tapIndex, float rotationAngle, float radius2) {
  // Offset on the unit disk, spun for this pixel
  float radiusScreen = 0.0;
  vec2 unitOffset = tapLocation(tapIndex, rotationAngle, radiusScreen);
  radiusScreen *= sampleRadiusScreen;

  // The occluding point in camera space
  vec3 v = getOffsetPositionView(uv, unitOffset, radiusScreen) - positionView;

  float vv = dot(v, v);
  float vn = dot(v, normalView) - uBias;

  float f = max(radius2 - vv, 0.0) / radius2;
  return f * f * f * max(vn / (EPSILON + vv), 0.0);
}

void main() {
  float visibility = 0.0;

  vec2 vUV = gl_FragCoord.xy * uTexelSize;
  vec3 originView = getPositionView(vUV);

  float depth = saturate(smoothstep(uNear, uFar, -originView.z));

  if (depth >= 1.0) {
    visibility = 1.0;
  } else {
    vec3 normalView = texture2D(uNormalTexture, vUV).rgb * 2.0 - 1.0;

    #ifdef USE_NOISE_TEXTURE
      float noise = texture2D(uNoiseTexture, gl_FragCoord.xy / uNoiseTextureSize).r;
    #else
      // Rotation jitter approach from
      // https://github.com/MaxwellGengYF/Unity-Ground-Truth-Ambient-Occlusion/blob/9cc30e0f31eb950a994c71866d79b2798d1c508e/Shaders/GTAO_Common.cginc#L152-L155
      float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    #endif

    float randomPatternRotationAngle = rand(gl_FragCoord.xy) * TWO_PI * noise;

    float radius = uRadius * RADIUS_MULTIPLIER;
    float projScale = 1.0 / (2.0 * tan(uFov * 0.5));
    float radiusScreen = projScale * radius / originView.z;

    float radius2 = radius * radius;

    for (int i = 0; i < NUM_SAMPLES; ++i) {
      visibility += sampleAO(vUV, originView, normalView, radiusScreen, i, randomPatternRotationAngle, radius2);
    }

    visibility = max(0.03, pow(1.0 - visibility / (4.0 * NUM_SAMPLES_FLOAT), 1.0 + uIntensity));
  }

  // Brightness/contrast adjust
  visibility = saturate(brightnessContrast(visibility, uBrightness, uContrast));

  gl_FragColor = vec4(visibility, 0.0, 0.0, 1.0);

  ${SHADERS.output.assignment}
}
`;
