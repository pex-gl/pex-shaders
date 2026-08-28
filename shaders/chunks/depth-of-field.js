/**
 * Depth of Field
 *
 * Based on:
 *
 * - "Bokeh depth of field in a single pass", Dennis Gustafsson:
 *   https://blog.voxagon.se/2018/05/04/bokeh-depth-of-field-in-single-pass.html
 * - "GLSL depth of field with bokeh v2.4", Martins Upitis:
 *   https://devlog-martinsh.blogspot.com/2011/12/glsl-depth-of-field-with-bokeh-v24.html
 *
 * @type {string}
 * @alias module:chunks.depthOfField
 */
export default /* wgsl */ `
struct DepthOfFieldParams {
  near: f32,
  far: f32,
  viewportSize: vec2f,
  texelSize: vec2f,
  chromaticAberration: f32,
  luminanceThreshold: f32,
  luminanceGain: f32,
  luminanceKnee: f32,
  fStop: f32, // only read when USE_DOF_PHYSICAL is true
  focalLength: f32, // only read when USE_DOF_PHYSICAL is true
  // Added to every depth coordinate, in UV. A temporally antialiased frame is
  // resolved to pixel centres while the depth buffer it came from was
  // rasterized with that frame's sub-pixel offset still in it, so the two are
  // misaligned by the offset — by a different amount every frame. Zero when
  // nothing is jittering.
  depthOffset: vec2f,
}

// Requires the threshold chunk for thresholdSoft.

// DOF_NUM_SAMPLES is expected to be declared as \`override\` i32 by the
// composing pipeline shader.
override DOF_NUM_SAMPLES: i32 = 6;
override USE_SHAPE_PENTAGON: bool = false;
override USE_DOF_DEBUG: bool = false;
override USE_DOF_PHYSICAL: bool = false;

// Default circle of confusion for simplicity's sake instead of sensor
// dimensions. 35mm film has a 24x36mm frame size which results in
// (43mm diagonal / 1500 enlargement of sensor size) = 0.029mm CoC.
const DOF_COC: f32 = 0.029;

// One gathered sample, defocused by its own circle of confusion: blur is that
// — normalized to [0, 1] — in both bokeh models, and it scales the chromatic
// aberration and the highlight boost. Never a per-tap weight: those describe
// the destination, and a sample that is boosted differently depending on which
// pixel gathered it is a bokeh that changes shape as the image moves.
fn dofProcessSample(tex: texture_2d<f32>, texSampler: sampler, coords: vec2f, blur: f32, params: DepthOfFieldParams) -> vec3f {
  let scale = params.texelSize * params.chromaticAberration * blur;

  let color = vec3f(
    textureSampleLevel(tex, texSampler, coords + vec2f(0.0, 1.0) * scale, 0.0).r,
    textureSampleLevel(tex, texSampler, coords + vec2f(-0.866, -0.5) * scale, 0.0).g,
    textureSampleLevel(tex, texSampler, coords + vec2f(0.866, -0.5) * scale, 0.0).b
  );

  // What makes a defocused highlight read as a bokeh sprite rather than dim:
  // spreading a bright point over a disc conserves its energy, so the disc is
  // darker than the point was, and the boost is what puts the sprite back.
  //
  // Soft-kneed, because it is multiplied by a circle of confusion. A hard
  // cutoff makes a sample sitting at the threshold a switch, and the thing
  // switching it is a per-pixel blur amount that a jittered raster already
  // makes unsteady — which is a highlight that blinks rather than one that
  // fades in as it defocuses.
  let boost = thresholdSoft(luma(color), params.luminanceThreshold, params.luminanceKnee)
    * params.luminanceGain;

  return color + color * boost * blur;
}

// focusScale != 1.0 makes the physical model non-physical too.
fn getCoC(depth: f32, focusDistance: f32, focusScale: f32, params: DepthOfFieldParams) -> f32 {
  if (USE_DOF_PHYSICAL) {
    let plane = (depth * params.focalLength) / (depth - params.focalLength);
    let far = (focusDistance * params.focalLength) / (focusDistance - params.focalLength);
    let near = (focusDistance - params.focalLength) / (focusDistance * params.fStop * focusScale * DOF_COC);
    return saturateF32(abs(plane - far) * near);
  }

  let coc = clamp((1.0 / focusDistance - 1.0 / depth) * focusScale, -1.0, 1.0); // (1 / mm - 1 / mm) * mm = mm
  return abs(coc);
}

fn dofDebug(texCoord: vec2f, focusDistance: f32, blur: f32, focusScale: f32, params: DepthOfFieldParams) -> vec3f {
  if (texCoord.x > 0.90) {
    let cameraDepth = (params.far - params.near) * 1000.0; // m -> mm
    let depth = texCoord.y * cameraDepth; // uv * mm = mm

    // CoC
    if (texCoord.x <= 0.95) {
      let t = (texCoord.x - 0.9) * 20.0;
      let coc = getCoC(depth, focusDistance, focusScale, params);
      if (coc > t) {
        return vec3f(1.0);
      }
      return vec3f(0.0);
    }

    // Focus distance
    if (texCoord.x > 0.97) {
      // Relative to camera depth (using 2.5% of camera depth)
      if (abs(depth - focusDistance) < cameraDepth * 0.0025) {
        return vec3f(1.0, 1.0, 0.0);
      }
      return vec3f(floor(texCoord.y * 10.0)) / 10.0;
    }

    // Focal length and f-stop
    let H = select(focusScale, params.focalLength * params.focalLength / (params.fStop * DOF_COC), USE_DOF_PHYSICAL);
    let nearPlane = H * focusDistance / (H + focusDistance);
    let farPlane = H * focusDistance / (H - focusDistance);

    if (abs(depth - H) < cameraDepth * 0.0025) {
      return vec3f(1.0, 1.0, 0.0);
    }
    if (depth < nearPlane) {
      return vec3f(1.0, 0.0, 0.0); // Foreground
    }
    if (depth > farPlane) {
      return vec3f(0.0, 0.0, 1.0); // Background
    }

    return vec3f(0.0, 1.0, 0.0);
  }
  // Blur amount in scene
  return vec3f(floor(abs(blur) / 0.1 * 100.0) / 100.0, 0.0, 0.0);
}

fn pentagonShape(coords: vec2f, rings: f32) -> f32 {
  let feather = 0.4; // pentagon shape feather
  let scale = rings - 1.3;

  let HS0 = vec4f(1.0, 0.0, 0.0, 1.0);
  let HS1 = vec4f(0.309016994, 0.951056516, 0.0, 1.0);
  let HS2 = vec4f(-0.809016994, 0.587785252, 0.0, 1.0);
  let HS3 = vec4f(-0.809016994, -0.587785252, 0.0, 1.0);
  let HS4 = vec4f(0.309016994, -0.951056516, 0.0, 1.0);
  let HS5 = vec4f(0.0, 0.0, 1.0, 1.0);

  let P = vec4f(coords, vec2f(scale, scale));

  var dist = vec4f(0.0);
  var inorout = -4.0;

  dist.x = dot(P, HS0);
  dist.y = dot(P, HS1);
  dist.z = dot(P, HS2);
  dist.w = dot(P, HS3);

  dist = smoothstep(vec4f(-feather), vec4f(feather), dist);
  inorout += dot(dist, vec4f(1.0));

  dist.x = dot(P, HS4);
  dist.y = HS5.w - abs(P.z);

  dist = smoothstep(vec4f(-feather), vec4f(feather), dist);
  inorout += dist.x;

  return saturateF32(inorout);
}

const DOF_GOLDEN_ANGLE: f32 = 2.39996323; // rad
const DOF_MAX_BLUR_SIZE: f32 = 30.0;
const DOF_RAD_SCALE: f32 = 0.5; // Smaller = nicer blur, larger = faster

fn depthOfFieldGustafsson(
  tex: texture_2d<f32>,
  texSampler: sampler,
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  texCoord: vec2f,
  focusDistance: f32,
  centerSizeIn: f32,
  focusScale: f32,
  centerDepth: f32,
  params: DepthOfFieldParams
) -> vec3f {
  if (USE_DOF_DEBUG) {
    if (texCoord.x > 0.5) {
      return dofDebug(texCoord, focusDistance, centerSizeIn, focusScale, params);
    }
  }

  let centerSize = centerSizeIn * DOF_MAX_BLUR_SIZE;

  var color = textureSampleLevel(tex, texSampler, texCoord, 0.0).rgb;
  var tot = 1.0;
  var radius = DOF_RAD_SCALE;

  // Heuristic to make DoF resolution independent
  let resolutionScale = pow(params.viewportSize.y / 1080.0, 2.0);
  let maxRadius = DOF_MAX_BLUR_SIZE * resolutionScale;

  for (var ang = 0.0; ang < maxRadius * f32(DOF_NUM_SAMPLES); ang += DOF_GOLDEN_ANGLE) {
    let tc = texCoord + vec2f(cos(ang), sin(ang)) * params.texelSize * radius;

    let sampleDepth = readDepth(depthTex, depthSampler, tc + params.depthOffset, params.near, params.far) * 1000.0; // m -> mm
    let sampleCoC = getCoC(sampleDepth, focusDistance, focusScale, params);
    var sampleSize = sampleCoC * DOF_MAX_BLUR_SIZE; // mm

    if (sampleDepth > centerDepth) {
      // Controls how much of the background gets blended into a blurry
      // foreground; unphysical, to approximate the occluded information
      // behind the foreground object.
      sampleSize = clamp(sampleSize, 0.0, centerSize * 2.0);
    }

    let m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);

    // The sample's own circle of confusion, not m. m is how much this tap
    // counts here — it ramps with the spiral radius, so it says where the
    // destination is within the disc, which is a sub-pixel quantity. Shaping a
    // highlight by it gives every bokeh disc a brightness profile tied to the
    // exact offset between source and destination, and one that squares once
    // the mix below applies m a second time: the disc then redraws itself
    // whenever anything shifts by a fraction of a pixel. A source pixel's
    // defocus belongs to the source, so the disc it spreads into is flat.
    color += mix(color / tot, dofProcessSample(tex, texSampler, tc, sampleCoC, params), m);
    tot += 1.0;

    radius += DOF_RAD_SCALE / radius * resolutionScale;

    if (radius > maxRadius) {
      break;
    }
  }

  return color / tot;
}

const DOF_RINGS: i32 = 4;
const DOF_MAX_BLUR: f32 = 1.0;
const DOF_BOKEH_EDGE_BIAS: f32 = 0.5; // bokeh edge bias
const DOF_DITHER_AMOUNT: f32 = 0.0001; // dither amount

fn depthOfFieldUpitis(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  focusDistance: f32,
  blur: f32,
  focusScale: f32,
  params: DepthOfFieldParams
) -> vec3f {
  if (USE_DOF_DEBUG) {
    if (texCoord.x > 0.5) {
      return dofDebug(texCoord, focusDistance, blur, focusScale, params);
    }
  }

  var color = textureSampleLevel(tex, texSampler, texCoord, 0.0).rgb;

  if (blur >= 0.05) {
    let noise = (vec2f(rand(texCoord), rand(texCoord * 2.0)) * vec2f(2.0) - vec2f(1.0)) * DOF_DITHER_AMOUNT * blur;
    let blurFactor = params.texelSize * blur * DOF_MAX_BLUR + noise;

    var s = 1.0;
    let ringFloat = f32(DOF_RINGS);

    for (var i = 1; i <= DOF_RINGS; i++) {
      let ringSamples = i * DOF_NUM_SAMPLES;
      let iFloat = f32(i);

      for (var j = 0; j < ringSamples; j++) {
        let jFloat = f32(j);
        let stepAngle = TWO_PI / f32(ringSamples);
        let pwh = vec2f(cos(jFloat * stepAngle) * iFloat, sin(jFloat * stepAngle) * iFloat);

        var p = 1.0;
        if (USE_SHAPE_PENTAGON) {
          p = pentagonShape(pwh, ringFloat);
        }

        let m = mix(1.0, iFloat / ringFloat, DOF_BOKEH_EDGE_BIAS) * p;
        color += dofProcessSample(tex, texSampler, texCoord + pwh * blurFactor, blur, params) * m;
        s += m;
      }
    }

    color /= s;
  }

  return color;
}
`;
