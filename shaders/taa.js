/**
 * TAA (Temporal Antialiasing)
 *
 * Accumulates a jittered sequence of frames into one converged image,
 * reprojecting the previous result through this frame's depth so a moving
 * camera keeps what it already resolved.
 *
 * Synthesised from the techniques that make it hold up rather than from one
 * reference: Karis' tonemapped blend space, reconstruction-filtered current
 * sample, rounded min/max neighbourhood and history clipping ("High Quality
 * Temporal Supersampling", SIGGRAPH 2014), Salvi's variance clipping ("An
 * Excursion in Temporal Supersampling", GDC 2016) widening it where the
 * neighbourhood understates the real range, and bicubic history resampling.
 *
 * The two halves of the blend have to describe the same thing for the sequence
 * to converge: the history is an estimate at the pixel centre, so the current
 * frame is reconstructed onto the pixel centre before it is mixed in rather
 * than being taken as the one jittered sample stored there.
 *
 * Requires `luminance` and `depthRead`.
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
  // View depth for the disocclusion test, whatever the projection.
  inverseProjectionMatrix: mat4x4f,
  previousViewMatrix: mat4x4f,
  texelSize: vec2f,
  // Weight given to the current frame, before anything raises it per pixel.
  // The reciprocal is roughly how many frames the estimate averages over, so
  // 0.1 converges over ~10.
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
  // Added to every read of what the scene pass wrote — depth, motion vectors.
  // Those are on the jittered raster grid, where a pixel holds the surface half
  // a pixel away and a different one each frame; the history and this pass's
  // output are on pixel centres. Without it the depth this frame recorded and
  // the depth last frame recorded describe different surfaces, and the
  // disocclusion test reads that as a disocclusion — every frame, wherever
  // depth changes fast, which is exactly where the history is worth keeping.
  depthOffset: vec2f,
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
  // Reversed-Z: the closest depth is the largest, and the background is 0.
  var closestDepth = 0.0;

  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      let offset = vec2f(f32(x), f32(y)) * texelSize;
      // Depth textures take an integer level, not the f32 a colour texture does.
      let depth = textureSampleLevel(depthTexture, depthSampler, uv + offset, 0);
      if (depth > closestDepth) {
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
  // Left homogeneous: an infinite far plane's background unprojects to a point
  // at infinity (w = 0), whose reprojection is the camera rotation alone.
  let world = params.inverseViewProjectionMatrix * vec4f(ndc, 1.0);

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
// The depth history is half float. A depth past its range, an infinite far
// plane's background included, would be recorded as +inf and never match, so
// both sides of the comparison are clamped to its largest value.
const TAA_DEPTH_HISTORY_MAX: f32 = 65504.0;

// What the depth history records, in this frame's view.
fn taaViewDepth(depth: f32, params: TAAParams) -> f32 {
  return min(linearizeDepth(depth, params.inverseProjectionMatrix), TAA_DEPTH_HISTORY_MAX);
}

// This surface's depth along the previous view axis, comparable with what
// taaViewDepth recorded last frame. View space rather than the previous clip w,
// which is the view depth under a perspective projection only.
fn taaPreviousViewDepth(uv: vec2f, depth: f32, params: TAAParams) -> f32 {
  let ndc = vec3f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth);
  let world = params.inverseViewProjectionMatrix * vec4f(ndc, 1.0);
  let view = params.previousViewMatrix * world;

  // Not divided by the zero w of an infinite far plane's background.
  return -view.z / max(view.w, -view.z / TAA_DEPTH_HISTORY_MAX);
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

  // The closest recorded depth in the neighbourhood, not the one texel under
  // previousUV. At a silhouette the reprojected position lands within a texel
  // of a depth discontinuity and a single tap picks whichever side it rounded
  // to, so a surface that is plainly still there reads as disoccluded along
  // every edge — which is precisely where the history is worth most, and where
  // throwing it away shows as edges that crawl.
  //
  // Asking whether *any* neighbour matches is the right question anyway: the
  // test is "was this surface here last frame", and a surface reprojected to
  // within a texel of where it was recorded was.
  var closest = 1e30;
  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      let recorded = textureSampleLevel(
        previousDepthTexture,
        previousDepthSampler,
        previousUV + vec2f(f32(x), f32(y)) * params.texelSize,
        0.0
      ).x;
      closest = min(closest, abs(expectedViewDepth - recorded));
    }
  }

  let tolerance =
    params.disocclusionTolerance * abs(expectedViewDepth) + depthSlope;

  return closest > tolerance;
}

// Paints what the resolve decided rather than what it produced, so a frame that
// will not accumulate says why instead of only looking wrong:
//
// - red      no history to blend at all (uniform, so the whole frame goes red)
// - orange   reprojection rejected: the surface was behind the previous camera
// - yellow   disoccluded: no depth recorded near where this surface reprojects
// - magenta  the history for this pixel was off-screen last frame
// - blue     blended. Green rises as the neighbourhood clip had to pull the
//            history in — fully green means it was clamped to the box edge,
//            which is a history the current frame is overruling. Blue itself
//            rises with the blend factor actually used, so a pixel the
//            responsive mask has forced to the current frame reads bright
//            rather than looking like any other blended pixel.
//
// Both channels answer the same question the rejection colours do — how much of
// this pixel is the frame in hand rather than the accumulation — so a pixel
// that will not settle is never blue-and-dark.
//
// Only meaningful from a pass that writes somewhere other than the history:
// painting these into the accumulator makes the next frame measure the history
// against an image it no longer resembles, and the clip channel then reads
// "clamped" everywhere regardless.
override USE_TAA_DEBUG: bool = false;

fn taaDebug(rejected: f32, clipped: f32, blendFactor: f32) -> vec4f {
  if (rejected == 1.0) { return vec4f(1.0, 0.0, 0.0, 1.0); }
  if (rejected == 2.0) { return vec4f(1.0, 0.5, 0.0, 1.0); }
  if (rejected == 3.0) { return vec4f(1.0, 1.0, 0.0, 1.0); }
  if (rejected == 4.0) { return vec4f(1.0, 0.0, 1.0, 1.0); }
  return vec4f(0.0, clipped, 0.25 + 0.75 * blendFactor, 1.0);
}

fn taaResolve(
  uv: vec2f,
  previousUV: vec2f,
  reprojectionValid: bool,
  sameSurface: bool,
  blendFactor: f32,
  colorTexture: texture_2d<f32>,
  colorSampler: sampler,
  historyTexture: texture_2d<f32>,
  historySampler: sampler,
  params: TAAParams
) -> vec4f {
  let center = textureSampleLevel(colorTexture, colorSampler, uv, 0.0);

  // Where this frame's samples actually sit, in pixels, relative to the centre
  // they are stored at: the raster was offset by the jitter, so the value at a
  // pixel is a sample of the scene up to half a pixel away — and somewhere else
  // again next frame.
  let jitterPixels = params.depthOffset / params.texelSize;

  // One pass over the 3x3 gathering three descriptions of it: Karis' rounded
  // min/max box, the mean and standard deviation Salvi's variance box needs,
  // and the current frame resampled onto the pixel centre.
  var m1 = vec3f(0.0);
  var m2 = vec3f(0.0);
  var boxMin = vec3f(1e30);
  var boxMax = vec3f(-1e30);
  var crossMin = vec3f(1e30);
  var crossMax = vec3f(-1e30);
  var filtered = vec3f(0.0);
  var filteredWeight = 0.0;
  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      let tap = textureSampleLevel(
        colorTexture, colorSampler, uv + vec2f(f32(x), f32(y)) * params.texelSize, 0.0
      ).rgb;
      let value = taaRGBToYCoCg(taaTonemap(tap));
      m1 += value;
      m2 += value * value;
      boxMin = min(boxMin, value);
      boxMax = max(boxMax, value);
      // The five-tap cross: the corners are a texel and a half away, so a box
      // including them describes a wider neighbourhood than the pixel is
      // reconstructed from.
      if (x == 0 || y == 0) {
        crossMin = min(crossMin, value);
        crossMax = max(crossMax, value);
      }
      // Blackman-Harris 3.3, as a Gaussian close enough to it, centred on the
      // pixel and evaluated at where each tap really sampled.
      let offset = vec2f(f32(x), f32(y)) - jitterPixels;
      let weight = exp(-2.29 * dot(offset, offset));
      filtered += value * weight;
      filteredWeight += weight;
    }
  }

  // Halfway between the two, which is the shape Karis settled on: the full box
  // holds a ghost, the cross alone clips a real edge.
  let roundedMin = 0.5 * (boxMin + crossMin);
  let roundedMax = 0.5 * (boxMax + crossMax);

  let mean = m1 / 9.0;
  let sigma = sqrt(max(vec3f(0.0), m2 / 9.0 - mean * mean));

  // The variance box may widen the neighbourhood's extent, never narrow it.
  //
  // A history that has converged lies between the darkest and brightest of its
  // neighbours by construction — it is the supersample of the same surface — so
  // clipping it to anything tighter is clipping the answer. Variance alone does
  // exactly that at a high-contrast edge, where the jitter moves both the mean
  // and the deviation every frame: the box breathes, the history is pulled a
  // different distance each time, and the edge never settles however low the
  // blend factor goes. What variance is still good for is the opposite case,
  // noisy content whose real range exceeds one 3x3.
  let minimum = min(mean - params.varianceGamma * sigma, roundedMin);
  let maximum = max(mean + params.varianceGamma * sigma, roundedMax);

  let offscreen =
    any(previousUV < vec2f(0.0)) || any(previousUV > vec2f(1.0));

  if (params.historyValid < 0.5 || !reprojectionValid || !sameSurface || offscreen) {
    if (USE_TAA_DEBUG) {
      var reason = 4.0;
      if (!sameSurface) { reason = 3.0; }
      if (!reprojectionValid) { reason = 2.0; }
      if (params.historyValid < 0.5) { reason = 1.0; }
      return taaDebug(reason, 0.0, blendFactor);
    }
    return vec4f(center.rgb, center.a);
  }

  let history = taaSampleHistory(historyTexture, historySampler, previousUV, params.texelSize);
  let historyRawYCoCg = taaRGBToYCoCg(taaTonemap(history));
  let historyYCoCg = taaClipToAABB(historyRawYCoCg, minimum, maximum);

  if (USE_TAA_DEBUG) {
    return taaDebug(
      0.0,
      min(length(historyYCoCg - historyRawYCoCg) * 8.0, 1.0),
      blendFactor
    );
  }
  // The reconstruction, not the raw sample.
  //
  // Blending the sample stored at this pixel means blending in a sample of the
  // scene half a pixel away, and a different half-pixel every frame — so
  // whatever fraction of it the blend takes arrives as that much of the jitter,
  // and an edge ripples at the blend factor however long it accumulates.
  // Resampling the neighbourhood back onto the pixel centre first is what makes
  // the current estimate mean the same thing the history does; the sequence
  // then supersamples instead of oscillating. It low-passes slightly, which is
  // what the sharpen pass exists to win back.
  let currentYCoCg = filtered / filteredWeight;

  // Mixing is linear and so is YCoCg, so this is a blend in the tonemapped
  // space and nothing else.
  let resolved = mix(historyYCoCg, currentYCoCg, blendFactor);

  return vec4f(
    max(vec3f(0.0), taaTonemapInverse(taaYCoCgToRGB(resolved))),
    center.a
  );
}
`;
