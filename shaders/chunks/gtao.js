/**
 * GTAO (Ground Truth Ambient Occlusion)
 *
 * Paper:
 * https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf
 *
 * Reference Implementation:
 * https://github.com/GameTechDev/XeGTAO/blob/master/Source/Rendering/Shaders/XeGTAO.hlsli
 *
 * Updates: Damien Seguin (2023-10)
 *
 * @type {string}
 * @alias module:chunks.gtao
 */
export default /* wgsl */ `
struct GTAOParams {
  near: f32,
  far: f32,
  fov: f32,
  viewportSize: vec2f,
  texelSize: vec2f,
  intensity: f32,
  radius: f32, // world (view space) maximum size of the shadow
  bias: f32,
  brightness: f32,
  contrast: f32,
  colorBounceIntensity: f32,
  noiseTextureSize: f32,
}

// GTAO_NUM_SLICES and GTAO_NUM_SAMPLES are expected to be declared as
// \`override\` i32 by the composing pipeline shader.
override GTAO_NUM_SLICES: i32 = 11;
override GTAO_NUM_SAMPLES: i32 = 7;
override USE_GTAO_NOISE_TEXTURE: bool = false;
override USE_GTAO_COLOR_BOUNCE: bool = false;

const GTAO_FALLOFF_RANGE: f32 = 0.615; // distant samples contribute less
const GTAO_SAMPLE_DISTRIBUTION_POWER: f32 = 2.0; // small crevices more important than big surfaces
// if the offset is under approx pixel size, push it out to the minimum distance
const GTAO_PIXEL_TOO_CLOSE_THRESHOLD: f32 = 1.3;

fn gtaoAddColorBounce(colorTex: texture_2d<f32>, colorSampler: sampler, normalView: vec3f, uv: vec2f, horizon: vec3f, radius: f32) -> vec3f {
  return textureSampleLevel(colorTex, colorSampler, uv, 0.0).rgb *
    saturateF32(dot(normalize(horizon), normalView)) *
    pow(1.0 - saturateF32(length(horizon) / radius), 2.0);
}

fn gtao(
  colorTex: texture_2d<f32>,
  colorSampler: sampler,
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  normalTex: texture_2d<f32>,
  normalSampler: sampler,
  noiseTex: texture_2d<f32>,
  noiseSampler: sampler,
  fragCoord: vec2f,
  params: GTAOParams,
  colorBounceOut: ptr<function, vec3f>
) -> f32 {
  var visibility = 0.0;
  var bounceColor = vec3f(0.0);

  let numSlicesFloat = f32(GTAO_NUM_SLICES);
  let numSamplesFloat = f32(GTAO_NUM_SAMPLES);
  let colorDivider = (numSamplesFloat * numSlicesFloat) * 2.0;

  let vUV = fragCoord * params.texelSize;
  let centerDepth = readDepth(depthTex, depthSampler, vUV, params.near, params.far);
  let centerPositionView = reconstructPositionFromDepth(vUV, centerDepth, params.fov, params.far, params.viewportSize);

  let depth = saturateF32(smoothstep(params.near, params.far, -centerPositionView.z));

  if (depth >= 1.0) {
    visibility = 1.0;
  } else {
    let normalView = textureSampleLevel(normalTex, normalSampler, vUV, 0.0).rgb * 2.0 - 1.0;
    let viewVec = normalize(-centerPositionView);

    let thinOccluderCompensation = params.bias;
    let falloffRange = GTAO_FALLOFF_RANGE * params.radius;
    let falloffFrom = params.radius * (1.0 - GTAO_FALLOFF_RANGE);
    let falloffMul = -1.0 / falloffRange;
    let falloffAdd = falloffFrom / falloffRange + 1.0;

    let projScale = 1.0 / (2.0 * tan(params.fov * 0.5));
    // Raw (non-linearized) depth sample: matches upstream's screen-space
    // radius heuristic, which scales by the undecoded depth value.
    let viewspaceZ = textureSampleLevel(depthTex, depthSampler, vUV, 0);
    let pixelDirRBViewspaceSizeAtCenterZ = viewspaceZ * (projScale * params.texelSize.x);
    let screenspaceRadius = params.radius / pixelDirRBViewspaceSizeAtCenterZ;

    // Below this, the sampling disk covers less than a pixel: no meaningful
    // occlusion signal, so treat the pixel as unoccluded.
    if (screenspaceRadius < GTAO_PIXEL_TOO_CLOSE_THRESHOLD) {
      visibility = 1.0;
    } else {
      var noiseSlice: f32;
      var noiseSample: f32;
      if (USE_GTAO_NOISE_TEXTURE) {
        let noise = textureSampleLevel(noiseTex, noiseSampler, fragCoord / params.noiseTextureSize, 0.0).xy;
        noiseSlice = noise.x;
        noiseSample = noise.y;
      } else {
        // Rotation jitter approach from
        // https://github.com/MaxwellGengYF/Unity-Ground-Truth-Ambient-Occlusion/blob/9cc30e0f31eb950a994c71866d79b2798d1c508e/Shaders/GTAO_Common.cginc#L152-L155
        noiseSlice = fract(52.9829189 * fract(dot(fragCoord, vec2f(0.06711056, 0.00583715))));
        let jitterMod = (fragCoord.x + fragCoord.y) * 0.25;
        noiseSample = fract(jitterMod) * (screenspaceRadius / numSamplesFloat) * 0.25;
      }

      visibility += saturateF32((10.0 - screenspaceRadius) / 100.0) * 0.5;

      // Avoids sampling the center pixel (no useful data there).
      let minS = GTAO_PIXEL_TOO_CLOSE_THRESHOLD / screenspaceRadius;

      for (var slice = 0; slice < GTAO_NUM_SLICES; slice++) {
        let sliceFloat = f32(slice);
        let sliceK = (sliceFloat + noiseSlice) / numSlicesFloat;
        let phi = sliceK * PI;
        let cosPhi = cos(phi);
        let sinPhi = sin(phi);
        let omega = vec2f(cosPhi, sinPhi) * screenspaceRadius;

        let directionVec = vec3f(cosPhi, sinPhi, 0.0);
        let orthoDirectionVec = directionVec - (dot(directionVec, viewVec) * viewVec);
        // axisVec is orthogonal to directionVec and viewVec, used to define projectedNormal
        let axisVec = normalize(cross(orthoDirectionVec, viewVec));
        let projectedNormalVec = normalView - axisVec * dot(normalView, axisVec);

        let signNorm = sign(dot(orthoDirectionVec, projectedNormalVec));
        var projectedNormalVecLength = length(projectedNormalVec);
        let cosNorm = saturateF32(dot(projectedNormalVec, viewVec) / projectedNormalVecLength);
        let n = signNorm * acos(cosNorm);

        // Lower weight target; not using -1 as in the original paper because
        // it is under horizon, so a 'weight' has different meaning based on
        // the normal.
        let lowHorizonCos0 = cos(n + HALF_PI);
        let lowHorizonCos1 = cos(n - HALF_PI);

        var horizonCos0 = lowHorizonCos0;
        var horizonCos1 = lowHorizonCos1;

        for (var j = 0; j < GTAO_NUM_SAMPLES; j++) {
          let stepFloat = f32(j);
          let stepNoise = fract(
            noiseSample +
            // R1 sequence (http://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/)
            (sliceFloat + stepFloat * numSamplesFloat) * 0.6180339887498948482
          );

          // Snap to pixel center (more correct direction math, avoids
          // artifacts due to sampling pos not matching depth texel center).
          let sampleOffset = round(
            (pow((stepFloat + stepNoise) / numSamplesFloat, GTAO_SAMPLE_DISTRIBUTION_POWER) + minS) * omega
          ) * params.texelSize;

          let sampleScreenPos0 = vUV + sampleOffset;
          let sampleScreenPos1 = vUV - sampleOffset;

          let sampleDepth0 = readDepth(depthTex, depthSampler, sampleScreenPos0, params.near, params.far);
          let sampleDepth1 = readDepth(depthTex, depthSampler, sampleScreenPos1, params.near, params.far);
          let samplePositionView0 = reconstructPositionFromDepth(sampleScreenPos0, sampleDepth0, params.fov, params.far, params.viewportSize);
          let samplePositionView1 = reconstructPositionFromDepth(sampleScreenPos1, sampleDepth1, params.fov, params.far, params.viewportSize);

          let sampleDelta0 = samplePositionView0 - centerPositionView;
          let sampleDelta1 = samplePositionView1 - centerPositionView;
          let sampleDist0 = length(sampleDelta0);
          let sampleDist1 = length(sampleDelta1);

          if (USE_GTAO_COLOR_BOUNCE) {
            bounceColor += gtaoAddColorBounce(colorTex, colorSampler, normalView, sampleScreenPos0, sampleDelta0, params.radius);
            bounceColor += gtaoAddColorBounce(colorTex, colorSampler, normalView, sampleScreenPos1, sampleDelta1, params.radius);
          }

          let sampleHorizonVec0 = sampleDelta0 / sampleDist0;
          let sampleHorizonVec1 = sampleDelta1 / sampleDist1;

          // Own thickness heuristic that relies on sooner discarding samples
          // behind the center.
          let falloffBase0 = length(vec3f(sampleDelta0.x, sampleDelta0.y, sampleDelta0.z * (1.0 + thinOccluderCompensation)));
          let falloffBase1 = length(vec3f(sampleDelta1.x, sampleDelta1.y, sampleDelta1.z * (1.0 + thinOccluderCompensation)));
          let weight0 = saturateF32(falloffBase0 * falloffMul + falloffAdd);
          let weight1 = saturateF32(falloffBase1 * falloffMul + falloffAdd);

          var shc0 = dot(sampleHorizonVec0, viewVec);
          var shc1 = dot(sampleHorizonVec1, viewVec);

          // Discard unwanted samples. This would be more correct but too
          // expensive: cos(mix(acos(lowHorizonCosN), acos(shcN), weightN)).
          shc0 = mix(lowHorizonCos0, shc0, weight0);
          shc1 = mix(lowHorizonCos1, shc1, weight1);

          horizonCos0 = max(horizonCos0, shc0);
          horizonCos1 = max(horizonCos1, shc1);
        }

        // Fudge for slight overdarkening on high slopes: in the training
        // set, 0.05 is close (PSNR 21.34) to disabled (PSNR 21.45).
        projectedNormalVecLength = mix(projectedNormalVecLength, 1.0, 0.05);

        let h0 = 2.0 * -acos(horizonCos1);
        let h1 = 2.0 * acos(horizonCos0);

        visibility += projectedNormalVecLength * (
          (cosNorm + h0 * sin(n) - cos(h0 - n)) +
          (cosNorm + h1 * sin(n) - cos(h1 - n))
        ) * 0.25;
      }

      visibility = max(0.03, pow(visibility / numSlicesFloat, 1.0 + params.intensity));
    }
  }

  visibility = saturateF32(brightnessContrastF32(visibility, params.brightness, params.contrast));

  if (USE_GTAO_COLOR_BOUNCE) {
    bounceColor /= colorDivider / params.colorBounceIntensity;
  }
  *colorBounceOut = bounceColor;

  return visibility;
}
`;
