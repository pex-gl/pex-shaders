import SHADERS from "../chunks/index.js";

/**
 * GTAO (Ground Truth)
 * Paper: https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf
 * Reference Implementation: https://github.com/GameTechDev/XeGTAO/blob/master/Source/Rendering/Shaders/XeGTAO.hlsli
 */
export default /* glsl */ `
precision highp float;

// Required defines:
// Number of hemisphere slices:
// #define NUM_SLICES 11
// Number of sample per slice:
// #define NUM_SAMPLES 7

// Optional defines:
// #define USE_NOISE_TEXTURE
// #define USE_COLOR_BOUNCE

${SHADERS.output.frag}

uniform sampler2D uTexture;
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

uniform float uIntensity;
uniform float uRadius; // world (viewspace) maximum size of the shadow
uniform float uBias;
uniform float uBrightness;
uniform float uContrast;

#ifdef USE_COLOR_BOUNCE
uniform float uColorBounceIntensity;
#endif

// Includes
${SHADERS.math.saturate}
${SHADERS.math.round}
${SHADERS.math.HALF_PI}
${SHADERS.math.PI}
${SHADERS.math.TWO_PI}
${SHADERS.depthRead}
${SHADERS.depthPosition}
${SHADERS.colorCorrection}

const float NUM_SLICES_FLOAT = float(NUM_SLICES);
const float NUM_SAMPLES_FLOAT = float(NUM_SAMPLES);
const float COLOR_DIVIDER = (NUM_SAMPLES_FLOAT * NUM_SLICES_FLOAT) * 2.0;

vec3 getPositionView(vec2 uv) {
  // TODO: sample depth from miplevel
  return reconstructPositionFromDepth(uv, readDepth(uDepthTexture, uv, uNear, uFar));
}

vec3 addColorBounce(vec3 normalView, vec2 uv, vec3 horizon, float radius) {
  return texture2D(uTexture, uv).rgb *
    saturate(dot(normalize(horizon), normalView)) *
    pow(1.0 - saturate(length(horizon) / radius), 2.0);
}

#define FALLOFF_RANGE 0.615 // distant samples contribute less
#define SAMPLE_DISTRIBUTION_POWER 2.0 // small crevices more important than big surfaces

// if the offset is under approx pixel size (pixelTooCloseThreshold), push it out to the minimum distance
const float pixelTooCloseThreshold = 1.3;

void main() {
  float visibility = 0.0;

  #ifdef USE_COLOR_BOUNCE
    vec3 color = vec3(0.0);
  #endif

  vec2 vUV = gl_FragCoord.xy * uTexelSize;
  vec3 centerPositionView = getPositionView(vUV);

  float depth = saturate(smoothstep(uNear, uFar, -centerPositionView.z));

  if (depth >= 1.0) {
    visibility = 1.0;
  } else {
    vec3 normalView = texture2D(uNormalTexture, vUV).rgb * 2.0 - 1.0;

    vec3 viewVec = normalize(-centerPositionView);

    float sampleDistributionPower = SAMPLE_DISTRIBUTION_POWER;
    float thinOccluderCompensation = uBias;
    float falloffRange = FALLOFF_RANGE * uRadius;

    float falloffFrom = uRadius * (1.0 - FALLOFF_RANGE);

    // fadeout precompute optimisation
    float falloffMul = -1.0 / falloffRange;
    float falloffAdd = falloffFrom / falloffRange + 1.0;

    // Get the screen space radius
    float projScale = 1.0 / (2.0 * tan(uFov * 0.5));
    float viewspaceZ = texture2D(uDepthTexture, vUV).x;
    // const vec2 pixelDirRBViewspaceSizeAtCenterZ = viewspaceZ.xx * consts.NDCToViewMul_x_PixelSize;
    float pixelDirRBViewspaceSizeAtCenterZ = viewspaceZ * (projScale * uTexelSize.x);
    float screenspaceRadius = uRadius / pixelDirRBViewspaceSizeAtCenterZ;

    #ifdef USE_NOISE_TEXTURE
      vec2 noise = texture2D(uNoiseTexture, gl_FragCoord.xy / uNoiseTextureSize).xy;
      float noiseSlice = noise.x;
      float noiseSample = noise.y;
    #else
      // Rotation jitter approach from
      // https://github.com/MaxwellGengYF/Unity-Ground-Truth-Ambient-Occlusion/blob/9cc30e0f31eb950a994c71866d79b2798d1c508e/Shaders/GTAO_Common.cginc#L152-L155
      float noiseSlice = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float jitterMod = (gl_FragCoord.x + gl_FragCoord.y) * 0.25;
      float noiseSample = mod(jitterMod, 1.0) * (screenspaceRadius / NUM_SAMPLES_FLOAT) * 0.25;
    #endif

    // fade out for small screen radii
    visibility += saturate((10.0 - screenspaceRadius) / 100.0) * 0.5;

    if (screenspaceRadius < pixelTooCloseThreshold) {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
      return;
    }

    // this is the min distance to start sampling from to avoid sampling from the center pixel (no useful data obtained from sampling center pixel)
    float minS = pixelTooCloseThreshold / screenspaceRadius;

    for (int slice = 0; slice < NUM_SLICES; slice++) {
      float sliceFloat = float(slice);
      float sliceK = (sliceFloat + noiseSlice) / NUM_SLICES_FLOAT;
      float phi = sliceK * PI;
      float cosPhi = cos(phi);
      float sinPhi = sin(phi);
      vec2 omega = vec2(cosPhi, sinPhi);

      // convert to screen units (pixels) for later use
      omega *= screenspaceRadius;

      vec3 directionVec = vec3(cosPhi, sinPhi, 0);
      vec3 orthoDirectionVec = directionVec - (dot(directionVec, viewVec) * viewVec);
      // axisVec is orthogonal to directionVec and viewVec, used to define projectedNormal
      vec3 axisVec = normalize(cross(orthoDirectionVec, viewVec));
      vec3 projectedNormalVec = normalView - axisVec * dot(normalView, axisVec);

      float signNorm = sign(dot(orthoDirectionVec, projectedNormalVec));
      float projectedNormalVecLength = length(projectedNormalVec);
      float cosNorm = saturate(dot(projectedNormalVec, viewVec) / projectedNormalVecLength);
      float n = signNorm * acos(cosNorm);

      // this is a lower weight target; not using -1 as in the original paper because it is under horizon, so a 'weight' has different meaning based on the normal
      float lowHorizonCos0 = cos(n + HALF_PI);
      float lowHorizonCos1 = cos(n - HALF_PI);

      float horizonCos0 = lowHorizonCos0;
      float horizonCos1 = lowHorizonCos1;

      for (int j = 0; j < NUM_SAMPLES; j++) {
        float stepFloat = float(j);
        float stepNoise = fract(
          noiseSample +
          // R1 sequence (http://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/)
          (sliceFloat + stepFloat * NUM_SAMPLES_FLOAT) * 0.6180339887498948482
        );

        // Snap to pixel center (more correct direction math, avoids artifacts due to sampling pos not matching depth texel center - messes up slope - but adds other
        // artifacts due to them being pushed off the slice). Also use full precision for high res cases.
        vec2 sampleOffset = round(
          (
            // minS to avoid sampling center pixel
            pow((stepFloat + stepNoise) / NUM_SAMPLES_FLOAT, sampleDistributionPower) + minS
          ) * omega
        ) * uTexelSize;

        vec2 sampleScreenPos0 = vUV + sampleOffset;
        vec2 sampleScreenPos1 = vUV - sampleOffset;

        vec3 sampleDelta0 = getPositionView(sampleScreenPos0) - centerPositionView;
        vec3 sampleDelta1 = getPositionView(sampleScreenPos1) - centerPositionView;
        float sampleDist0 = length(sampleDelta0);
        float sampleDist1 = length(sampleDelta1);

        #ifdef USE_COLOR_BOUNCE
          color += addColorBounce(normalView, sampleScreenPos0, sampleDelta0, uRadius);
          color += addColorBounce(normalView, sampleScreenPos1, sampleDelta1, uRadius);
        #endif

        vec3 sampleHorizonVec0 = vec3(sampleDelta0 / sampleDist0);
        vec3 sampleHorizonVec1 = vec3(sampleDelta1 / sampleDist1);

        // this is our own thickness heuristic that relies on sooner discarding samples behind the center
        float falloffBase0 = length(vec3(sampleDelta0.x, sampleDelta0.y, sampleDelta0.z * (1.0 + thinOccluderCompensation)));
        float falloffBase1 = length(vec3(sampleDelta1.x, sampleDelta1.y, sampleDelta1.z * (1.0 + thinOccluderCompensation)));
        float weight0 = saturate(falloffBase0 * falloffMul + falloffAdd);
        float weight1 = saturate(falloffBase1 * falloffMul + falloffAdd);

        // sample horizon cos
        float shc0 = dot(sampleHorizonVec0, viewVec);
        float shc1 = dot(sampleHorizonVec1, viewVec);

        // discard unwanted samples
        // this would be more correct but too expensive: cos(mix(acos(lowHorizonCosN), acos(shcN), weightN));
        shc0 = mix(lowHorizonCos0, shc0, weight0);
        shc1 = mix(lowHorizonCos1, shc1, weight1);

        // thicknessHeuristic disabled
        // https://github.com/GameTechDev/XeGTAO/tree/master#thin-occluder-conundrum
        horizonCos0 = max(horizonCos0, shc0);
        horizonCos1 = max(horizonCos1, shc1);
      }

      // I can't figure out the slight overdarkening on high slopes, so I'm adding this fudge - in the training set, 0.05 is close (PSNR 21.34) to disabled (PSNR 21.45)
      projectedNormalVecLength = mix(projectedNormalVecLength, 1.0, 0.05);

      float h0 = 2.0 * -acos(horizonCos1);
      float h1 = 2.0 * acos(horizonCos0);

      visibility += projectedNormalVecLength * (
        (cosNorm + h0 * sin(n) - cos(h0 - n)) +
        (cosNorm + h1 * sin(n) - cos(h1 - n))
      ) * 0.25;
    }

    visibility = max(0.03, pow(visibility / NUM_SLICES_FLOAT, 1.0 + uIntensity));
  }

  visibility = saturate(brightnessContrast(visibility, uBrightness, uContrast));

  #ifdef USE_COLOR_BOUNCE
    color /= COLOR_DIVIDER / uColorBounceIntensity;
    gl_FragColor = vec4(color, visibility);
  #else
    gl_FragColor = vec4(visibility, 0.0, 0.0, 1.0);
  #endif

  ${SHADERS.output.assignment}
}
`;
