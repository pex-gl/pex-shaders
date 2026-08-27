/**
 * TAA (Temporal Antialiasing)
 *
 * Accumulates a jittered sequence of frames into one converged image,
 * reprojecting the previous result through this frame's depth so a moving
 * camera keeps what it already resolved.
 *
 * Synthesised from the techniques that make it hold up rather than from one
 * reference: Karis' tonemapped blend space and history clipping
 * ("High Quality Temporal Supersampling", SIGGRAPH 2014), Salvi's variance
 * clipping ("An Excursion in Temporal Supersampling", GDC 2016), and bicubic
 * history resampling.
 *
 * Requires `luminance`.
 *
 * Updates: Damien Seguin (2026-08)
 *
 * @member {string}
 */
export default /* wgsl */ `
struct TAAParams {
  // Both unjittered. The jitter says where geometry was rasterized this frame,
  // not where a world point maps, and reprojecting with it would read the
  // history at the offset instead of at the surface.
  inverseViewProjectionMatrix: mat4x4f,
  previousViewProjectionMatrix: mat4x4f,
  texelSize: vec2f,
  // Weight given to the current frame. The reciprocal is roughly how many
  // frames the estimate averages over, so 0.1 converges over ~10.
  blendFactor: f32,
  // Half-width of the clipping box, in standard deviations of the neighbourhood.
  // Below ~1 the history is clipped so hard it stops accumulating; above ~1.5
  // ghosting starts to survive.
  varianceGamma: f32,
  // 0 when there is no history worth blending: the first frame for a camera,
  // and the first after a resize reallocated the history texture.
  historyValid: f32,
  // How far the depth recorded at a reprojected position may differ from the
  // one this surface would have had there, as a fraction of that depth, before
  // the two are taken to be different surfaces. 0 disables the test.
  disocclusionTolerance: f32,
}

// Blending in a tonemapped space is what stops a single bright sample from
// dominating: in linear HDR one firefly outweighs the whole neighbourhood, and
// the clipping box it widens never closes again. Luma-weighted so the compression
// preserves hue.
fn taaTonemap(color: vec3f) -> vec3f {
  return color / (1.0 + luminance(color));
}

// Exact inverse of taaTonemap: for c' = c / (1 + L), luminance(c') is L / (1 + L),
// so 1 - luminance(c') is 1 / (1 + L).
fn taaTonemapInverse(color: vec3f) -> vec3f {
  return color / max(1.0 - luminance(color), 1e-4);
}

// The neighbourhood statistics are gathered in YCoCg rather than RGB so the
// clipping box separates luma from chroma. A box in RGB is a cube spanning all
// three channels at once, which is far looser than the image actually is.
fn taaRGBToYCoCg(color: vec3f) -> vec3f {
  return vec3f(
    0.25 * color.r + 0.5 * color.g + 0.25 * color.b,
    0.5 * color.r - 0.5 * color.b,
    -0.25 * color.r + 0.5 * color.g - 0.25 * color.b
  );
}

fn taaYCoCgToRGB(color: vec3f) -> vec3f {
  return vec3f(
    color.x + color.y - color.z,
    color.x + color.z,
    color.x - color.y - color.z
  );
}

// Clip rather than clamp: moving the history along the ray towards the
// neighbourhood centre keeps its hue, where clamping each channel independently
// lands on a corner of the box and shifts it.
fn taaClipToAABB(history: vec3f, minimum: vec3f, maximum: vec3f) -> vec3f {
  let center = 0.5 * (maximum + minimum);
  let extents = 0.5 * (maximum - minimum) + 1e-5;
  let offset = history - center;
  let units = abs(offset) / extents;
  let scale = max(units.x, max(units.y, units.z));

  if (scale <= 1.0) { return history; }
  return center + offset / scale;
}

// Bicubic (Catmull-Rom) history resampling, nine bilinear fetches standing in
// for sixteen taps. Bilinear would low-pass the history once per frame and that
// compounds — it is the usual reason temporal antialiasing reads as blur.
fn taaSampleHistory(
  historyTexture: texture_2d<f32>,
  historySampler: sampler,
  uv: vec2f,
  texelSize: vec2f
) -> vec3f {
  let samplePosition = uv / texelSize;
  let texelCenter = floor(samplePosition - 0.5) + 0.5;
  let f = samplePosition - texelCenter;
  let f2 = f * f;
  let f3 = f2 * f;

  let w0 = f2 - 0.5 * (f3 + f);
  let w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
  let w3 = 0.5 * (f3 - f2);
  // The four weights sum to one, so the third follows from the others.
  let w2 = 1.0 - w0 - w1 - w3;

  // The middle pair folds into a single offset tap, which is what brings
  // sixteen samples down to nine.
  let w12 = w1 + w2;
  let offset12 = w2 / w12;

  let uv0 = (texelCenter - 1.0) * texelSize;
  let uv3 = (texelCenter + 2.0) * texelSize;
  let uv12 = (texelCenter + offset12) * texelSize;

  var result = vec3f(0.0);
  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv0.x, uv0.y), 0.0).rgb * w0.x * w0.y;
  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv12.x, uv0.y), 0.0).rgb * w12.x * w0.y;
  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv3.x, uv0.y), 0.0).rgb * w3.x * w0.y;

  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv0.x, uv12.y), 0.0).rgb * w0.x * w12.y;
  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv12.x, uv12.y), 0.0).rgb * w12.x * w12.y;
  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv3.x, uv12.y), 0.0).rgb * w3.x * w12.y;

  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv0.x, uv3.y), 0.0).rgb * w0.x * w3.y;
  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv12.x, uv3.y), 0.0).rgb * w12.x * w3.y;
  result += textureSampleLevel(historyTexture, historySampler, vec2f(uv3.x, uv3.y), 0.0).rgb * w3.x * w3.y;

  // A negative lobe can undershoot into negatives on a high-contrast edge, and
  // the tonemap inverse turns that into a hole.
  return max(vec3f(0.0), result);
}

// Offset of the nearest-depth neighbour, and its depth. At a silhouette the
// pixel centre can sit on background while the edge that moved belongs to the
// foreground; following the background drags a halo behind the object.
fn taaClosestDepthOffset(
  depthTexture: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  texelSize: vec2f
) -> vec3f {
  var closestOffset = vec2f(0.0);
  var closestDepth = 1.0;

  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      let offset = vec2f(f32(x), f32(y)) * texelSize;
      // Depth textures take an integer level, not the f32 a colour texture does.
      let depth = textureSampleLevel(depthTexture, depthSampler, uv + offset, 0);
      if (depth < closestDepth) {
        closestDepth = depth;
        closestOffset = offset;
      }
    }
  }

  return vec3f(closestOffset, closestDepth);
}

// Where this pixel's surface sat last frame, in UV, plus a validity flag in z.
// Camera motion only — an object's own contribution comes from the velocity
// buffer and is added on top.
fn taaReprojectUV(uv: vec2f, depth: f32, params: TAAParams) -> vec3f {
  // WebGPU's V points down where clip space Y points up.
  let ndc = vec3f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth);
  var world = params.inverseViewProjectionMatrix * vec4f(ndc, 1.0);
  world = world / world.w;

  let previousClip = params.previousViewProjectionMatrix * world;
  // Behind the previous camera, where the perspective divide would fold the
  // point back into view at a mirrored position.
  if (previousClip.w <= 0.0) { return vec3f(0.0); }

  let previousNDC = previousClip.xy / previousClip.w;
  return vec3f(previousNDC.x * 0.5 + 0.5, 0.5 - previousNDC.y * 0.5, 1.0);
}

// Where this surface was last frame, from the motion vector written for it.
// Sampled at the nearest-depth neighbour, for the reason above.
fn taaVelocityUV(
  velocityTexture: texture_2d<f32>,
  velocitySampler: sampler,
  uv: vec2f,
  closestOffset: vec2f
) -> vec2f {
  return uv + textureSampleLevel(velocityTexture, velocitySampler, uv + closestOffset, 0.0).xy;
}

// Reprojection is the caller's to compute — from motion vectors where they
// exist, and from depth where they do not — so this owns only what both share.
// This surface's depth along the previous view axis.
//
// Unprojecting NDC gives a homogeneous point whose w is the reciprocal of the
// clip w that produced it, so projecting it back through the previous
// view-projection hands the previous clip w straight back — which for a
// perspective projection is the view depth, with no near, far or view matrix
// needed. An orthographic projection has a constant clip w, so this returns a
// constant and the test that uses it never fires: no rejection rather than a
// wrong one.
fn taaPreviousViewDepth(uv: vec2f, depth: f32, params: TAAParams) -> f32 {
  let ndc = vec3f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth);
  var world = params.inverseViewProjectionMatrix * vec4f(ndc, 1.0);
  world = world / world.w;

  return (params.previousViewProjectionMatrix * world).w;
}

/**
 * Whether the history at \`previousUV\` describes a different surface — one that
 * was in front of, or behind, the one being shaded now.
 *
 * This is what neighbourhood clipping cannot do. Clipping asks whether the
 * history looks plausible next to the pixels around it, and an occluder of
 * roughly the same colour as what it was hiding passes that test while being
 * entirely the wrong surface. Depth answers the question clipping is standing
 * in for: is this the same thing.
 *
 * The tolerance is relative because absolute depth error grows with distance,
 * plus a slope term: on a surface seen at a grazing angle the depth changes
 * fast across a pixel, so a reprojection landing a fraction of a pixel off
 * reads as a large depth difference. Without that term a floor would stop
 * accumulating wherever it recedes.
 */
fn taaDisoccluded(
  previousDepthTexture: texture_2d<f32>,
  previousDepthSampler: sampler,
  previousUV: vec2f,
  expectedViewDepth: f32,
  depthSlope: f32,
  params: TAAParams
) -> bool {
  if (params.disocclusionTolerance <= 0.0) { return false; }

  let recorded = textureSampleLevel(
    previousDepthTexture, previousDepthSampler, previousUV, 0.0
  ).x;
  let tolerance =
    params.disocclusionTolerance * abs(expectedViewDepth) + depthSlope;

  return abs(expectedViewDepth - recorded) > tolerance;
}

fn taaResolve(
  uv: vec2f,
  previousUV: vec2f,
  reprojectionValid: bool,
  colorTexture: texture_2d<f32>,
  colorSampler: sampler,
  historyTexture: texture_2d<f32>,
  historySampler: sampler,
  params: TAAParams
) -> vec4f {
  let center = textureSampleLevel(colorTexture, colorSampler, uv, 0.0);

  // Mean and standard deviation over the 3x3, not its min and max: the extremes
  // of a noisy neighbourhood describe a box far wider than the image, and
  // ghosting survives inside it.
  var m1 = vec3f(0.0);
  var m2 = vec3f(0.0);
  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      let tap = textureSampleLevel(
        colorTexture, colorSampler, uv + vec2f(f32(x), f32(y)) * params.texelSize, 0.0
      ).rgb;
      let value = taaRGBToYCoCg(taaTonemap(tap));
      m1 += value;
      m2 += value * value;
    }
  }
  let mean = m1 / 9.0;
  let sigma = sqrt(max(vec3f(0.0), m2 / 9.0 - mean * mean));
  let minimum = mean - params.varianceGamma * sigma;
  let maximum = mean + params.varianceGamma * sigma;

  let offscreen =
    any(previousUV < vec2f(0.0)) || any(previousUV > vec2f(1.0));

  if (params.historyValid < 0.5 || !reprojectionValid || offscreen) {
    return vec4f(center.rgb, center.a);
  }

  let history = taaSampleHistory(historyTexture, historySampler, previousUV, params.texelSize);
  let historyYCoCg = taaClipToAABB(
    taaRGBToYCoCg(taaTonemap(history)), minimum, maximum
  );
  let currentYCoCg = taaRGBToYCoCg(taaTonemap(center.rgb));

  // Mixing is linear and so is YCoCg, so this is a blend in the tonemapped
  // space and nothing else.
  let resolved = mix(historyYCoCg, currentYCoCg, params.blendFactor);

  return vec4f(
    max(vec3f(0.0), taaTonemapInverse(taaYCoCgToRGB(resolved))),
    center.a
  );
}
`;
