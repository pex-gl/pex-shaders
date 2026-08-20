/**
 * SAO (Scalable Ambient Obscurance)
 *
 * Paper:
 * https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf
 * (https://casual-effects.com/research/McGuire2012SAO/index.html)
 *
 * Reference Implementation: https://gist.github.com/transitive-bullshit/6770311
 *
 * Updates: Marcin Ignac (2017-05-08) and Damien Seguin (2023-10)
 *
 * @type {string}
 * @alias module:chunks.sao
 */
export default /* wgsl */ `
struct SAOParams {
  near: f32,
  far: f32,
  fov: f32,
  viewportSize: vec2f,
  texelSize: vec2f,
  intensity: f32, // darkening factor
  radius: f32, // world-space AO radius in scene units (r), e.g. 1.0m
  bias: f32, // bias to avoid AO in smooth corners, e.g. 0.01m
  brightness: f32,
  contrast: f32,
  noiseTextureSize: f32,
}

// SAO_NUM_SAMPLES and SAO_NUM_SPIRAL_TURNS are expected to be declared as
// \`override\` i32 by the composing pipeline shader. SAO_NUM_SPIRAL_TURNS
// should be a prime number to prevent taps from lining up.
override SAO_NUM_SAMPLES: i32 = 11;
override SAO_NUM_SPIRAL_TURNS: i32 = 7;
override USE_SAO_NOISE_TEXTURE: bool = false;

const SAO_RADIUS_MULTIPLIER: f32 = 500.0;
const SAO_EPSILON: f32 = 0.01;

// Returns a unit vector and a screen-space radius for the tap on a unit disk
// (the caller should scale by the actual disk radius)
fn saoTapLocation(sampleNumber: i32, spinAngle: f32, numSpiralTurnsTimesTwoPi: f32, radiusScreenOut: ptr<function, f32>) -> vec2f {
  // Radius relative to radiusScreen
  let alpha = (f32(sampleNumber) + 0.5) / f32(SAO_NUM_SAMPLES);
  let angle = alpha * numSpiralTurnsTimesTwoPi + spinAngle;

  *radiusScreenOut = alpha;
  return vec2f(cos(angle), sin(angle));
}

fn saoSample(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  positionView: vec3f,
  normalView: vec3f,
  sampleRadiusScreen: f32,
  tapIndex: i32,
  rotationAngle: f32,
  radius2: f32,
  numSpiralTurnsTimesTwoPi: f32,
  params: SAOParams
) -> f32 {
  // Offset on the unit disk, spun for this pixel
  var radiusScreen = 0.0;
  let unitOffset = saoTapLocation(tapIndex, rotationAngle, numSpiralTurnsTimesTwoPi, &radiusScreen);
  radiusScreen *= sampleRadiusScreen;

  // The occluding point in camera space
  let sampleUV = uv + radiusScreen * unitOffset * params.texelSize;
  let sampleDepth = readDepth(depthTex, depthSampler, sampleUV, params.near, params.far);
  let samplePositionView = reconstructPositionFromDepth(sampleUV, sampleDepth, params.fov, params.far, params.viewportSize);

  let v = samplePositionView - positionView;

  let vv = dot(v, v);
  let vn = dot(v, normalView) - params.bias;

  let f = max(radius2 - vv, 0.0) / radius2;
  return f * f * f * max(vn / (SAO_EPSILON + vv), 0.0);
}

fn sao(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  normalTex: texture_2d<f32>,
  normalSampler: sampler,
  noiseTex: texture_2d<f32>,
  noiseSampler: sampler,
  fragCoord: vec2f,
  params: SAOParams
) -> f32 {
  var visibility = 0.0;

  let numSamplesFloat = f32(SAO_NUM_SAMPLES);
  let numSpiralTurnsTimesTwoPi = f32(SAO_NUM_SPIRAL_TURNS) * TWO_PI;

  let vUV = fragCoord * params.texelSize;
  let originDepth = readDepth(depthTex, depthSampler, vUV, params.near, params.far);
  let originView = reconstructPositionFromDepth(vUV, originDepth, params.fov, params.far, params.viewportSize);

  let depth = saturateF32(smoothstep(params.near, params.far, -originView.z));

  if (depth >= 1.0) {
    visibility = 1.0;
  } else {
    let normalView = textureSampleLevel(normalTex, normalSampler, vUV, 0.0).rgb * 2.0 - 1.0;

    var noise: f32;
    if (USE_SAO_NOISE_TEXTURE) {
      noise = textureSampleLevel(noiseTex, noiseSampler, fragCoord / params.noiseTextureSize, 0.0).r;
    } else {
      // Rotation jitter approach from
      // https://github.com/MaxwellGengYF/Unity-Ground-Truth-Ambient-Occlusion/blob/9cc30e0f31eb950a994c71866d79b2798d1c508e/Shaders/GTAO_Common.cginc#L152-L155
      noise = fract(52.9829189 * fract(dot(fragCoord, vec2f(0.06711056, 0.00583715))));
    }

    let randomPatternRotationAngle = rand(fragCoord) * TWO_PI * noise;

    let radius = params.radius * SAO_RADIUS_MULTIPLIER;
    let projScale = 1.0 / (2.0 * tan(params.fov * 0.5));
    let radiusScreen = projScale * radius / originView.z;

    let radius2 = radius * radius;

    for (var i = 0; i < SAO_NUM_SAMPLES; i++) {
      visibility += saoSample(depthTex, depthSampler, vUV, originView, normalView, radiusScreen, i, randomPatternRotationAngle, radius2, numSpiralTurnsTimesTwoPi, params);
    }

    visibility = max(0.03, pow(1.0 - visibility / (4.0 * numSamplesFloat), 1.0 + params.intensity));
  }

  return saturateF32(brightnessContrastF32(visibility, params.brightness, params.contrast));
}
`;
