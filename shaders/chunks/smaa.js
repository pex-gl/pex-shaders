/**
 * SMAA (Enhanced Subpixel Morphological Antialiasing) 1x
 *
 * Paper: http://www.iryoku.com/smaa/
 *
 * Reference Implementations:
 *
 * - https://github.com/iryoku/smaa (SMAA.hlsl)
 * - https://github.com/dmnsgn/glsl-smaa
 *
 * Ported to WGSL keeping the reference's top-left texture origin, which WebGPU
 * shares: the GLSL port had to flip the search texture on upload to compensate
 * for GL's bottom-left origin, and this one must not.
 *
 * The three parts map to the three passes: edge detection, blending weight
 * calculation against the precomputed area/search textures, and neighborhood
 * blending. Every function takes its textures and texel size as parameters —
 * chunks declare no bindings.
 *
 * @type {object}
 * @name smaa
 * @static
 */

/**
 * Quality preset and shared helpers. Required by all three passes.
 *
 * The preset overrides map to the reference's SMAA_PRESET_* blocks:
 * low/medium disable diagonal and corner detection outright.
 *
 * @member {string}
 */
const common = /* wgsl */ `
override SMAA_THRESHOLD: f32 = 0.1;
override SMAA_MAX_SEARCH_STEPS: i32 = 16;
override SMAA_MAX_SEARCH_STEPS_DIAG: i32 = 8;
override SMAA_CORNER_ROUNDING: i32 = 25;
override SMAA_DISABLE_DIAG_DETECTION: bool = false;
override SMAA_DISABLE_CORNER_DETECTION: bool = false;

// Edge detection is tuned for gamma-space color: SMAA is an LDR technique, and
// its thresholds are perceptual. Sampling an \`-srgb\` format target decodes to
// linear, so the value has to be re-encoded before it is compared.
override SMAA_SRGB_INPUT: bool = true;

const SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR: f32 = 2.0;
const SMAA_AREATEX_MAX_DISTANCE: f32 = 16.0;
const SMAA_AREATEX_MAX_DISTANCE_DIAG: f32 = 20.0;
const SMAA_AREATEX_PIXEL_SIZE: vec2f = vec2f(1.0 / 160.0, 1.0 / 560.0);
const SMAA_AREATEX_SUBTEX_SIZE: f32 = 1.0 / 7.0;
const SMAA_SEARCHTEX_SIZE: vec2f = vec2f(66.0, 33.0);
const SMAA_SEARCHTEX_PACKED_SIZE: vec2f = vec2f(64.0, 16.0);

// GLSL's round() is floor(x + 0.5); WGSL's rounds halves to even. The decoders
// below depend on the former.
fn smaaRoundF32(x: f32) -> f32 {
  return floor(x + 0.5);
}
fn smaaRoundVec2(x: vec2f) -> vec2f {
  return floor(x + 0.5);
}
fn smaaRoundVec4(x: vec4f) -> vec4f {
  return floor(x + 0.5);
}

fn smaaSampleOffset(tex: texture_2d<f32>, texSampler: sampler, texelSize: vec2f, coord: vec2f, offset: vec2f) -> vec4f {
  return textureSampleLevel(tex, texSampler, coord + offset * texelSize, 0.0);
}
`;

/**
 * Pass 1: edge detection. Writes the left/top edge pair, and discards where
 * there is none — the stencil-like early out the reference relies on.
 *
 * Requires {@link common} and, for the color and luma variants, the
 * encodeDecode chunk.
 *
 * @member {string}
 */
const edges = /* wgsl */ `
fn smaaSampleColor(tex: texture_2d<f32>, texSampler: sampler, uv: vec2f) -> vec3f {
  let color = textureSampleLevel(tex, texSampler, uv, 0.0).rgb;
  return select(color, toGammaVec3(color), SMAA_SRGB_INPUT);
}

fn smaaLumaEdgeDetection(
  colorTex: texture_2d<f32>,
  colorSampler: sampler,
  texCoord: vec2f,
  offset0: vec4f,
  offset1: vec4f,
  offset2: vec4f
) -> vec2f {
  let weights = vec3f(0.2126, 0.7152, 0.0722);
  let L = dot(smaaSampleColor(colorTex, colorSampler, texCoord), weights);

  let Lleft = dot(smaaSampleColor(colorTex, colorSampler, offset0.xy), weights);
  let Ltop = dot(smaaSampleColor(colorTex, colorSampler, offset0.zw), weights);

  var delta = vec4f(abs(L - vec2f(Lleft, Ltop)), 0.0, 0.0);
  var edges = step(vec2f(SMAA_THRESHOLD), delta.xy);

  if (dot(edges, vec2f(1.0)) == 0.0) {
    discard;
  }

  let Lright = dot(smaaSampleColor(colorTex, colorSampler, offset1.xy), weights);
  let Lbottom = dot(smaaSampleColor(colorTex, colorSampler, offset1.zw), weights);
  delta = vec4f(delta.xy, abs(L - vec2f(Lright, Lbottom)));

  // Maximum delta in the direct neighborhood
  var maxDelta = max(delta.xy, delta.zw);

  let Lleftleft = dot(smaaSampleColor(colorTex, colorSampler, offset2.xy), weights);
  let Ltoptop = dot(smaaSampleColor(colorTex, colorSampler, offset2.zw), weights);
  delta = vec4f(delta.xy, abs(vec2f(Lleft, Ltop) - vec2f(Lleftleft, Ltoptop)));

  maxDelta = max(maxDelta, delta.zw);
  let finalDelta = max(maxDelta.x, maxDelta.y);

  // Local contrast adaptation
  edges *= step(vec2f(finalDelta), SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR * delta.xy);

  return edges;
}

fn smaaColorDelta(a: vec3f, b: vec3f) -> f32 {
  let t = abs(a - b);
  return max(max(t.r, t.g), t.b);
}

fn smaaColorEdgeDetection(
  colorTex: texture_2d<f32>,
  colorSampler: sampler,
  texCoord: vec2f,
  offset0: vec4f,
  offset1: vec4f,
  offset2: vec4f
) -> vec2f {
  let c = smaaSampleColor(colorTex, colorSampler, texCoord);

  let cLeft = smaaSampleColor(colorTex, colorSampler, offset0.xy);
  let cTop = smaaSampleColor(colorTex, colorSampler, offset0.zw);
  var delta = vec4f(smaaColorDelta(c, cLeft), smaaColorDelta(c, cTop), 0.0, 0.0);

  var edges = step(vec2f(SMAA_THRESHOLD), delta.xy);

  if (dot(edges, vec2f(1.0)) == 0.0) {
    discard;
  }

  let cRight = smaaSampleColor(colorTex, colorSampler, offset1.xy);
  let cBottom = smaaSampleColor(colorTex, colorSampler, offset1.zw);
  delta = vec4f(delta.xy, smaaColorDelta(c, cRight), smaaColorDelta(c, cBottom));

  var maxDelta = max(delta.xy, delta.zw);

  let cLeftLeft = smaaSampleColor(colorTex, colorSampler, offset2.xy);
  let cTopTop = smaaSampleColor(colorTex, colorSampler, offset2.zw);
  delta = vec4f(delta.xy, smaaColorDelta(c, cLeftLeft), smaaColorDelta(c, cTopTop));

  maxDelta = max(maxDelta, delta.zw);
  let finalDelta = max(maxDelta.x, maxDelta.y);

  edges *= step(vec2f(finalDelta), SMAA_LOCAL_CONTRAST_ADAPTATION_FACTOR * delta.xy);

  return edges;
}

fn smaaDepthEdgeDetection(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  texCoord: vec2f,
  offset0: vec4f
) -> vec2f {
  let P = textureSampleLevel(depthTex, depthSampler, texCoord, 0);
  let Pleft = textureSampleLevel(depthTex, depthSampler, offset0.xy, 0);
  let Ptop = textureSampleLevel(depthTex, depthSampler, offset0.zw, 0);

  let delta = abs(vec2f(P) - vec2f(Pleft, Ptop));
  let edges = step(vec2f(0.1 * SMAA_THRESHOLD), delta);

  if (dot(edges, vec2f(1.0)) == 0.0) {
    discard;
  }

  return edges;
}
`;

/**
 * Pass 2: blending weight calculation. Searches the edge buffer for the
 * distance to each line end, then looks up the precomputed coverage area.
 *
 * Requires {@link common}.
 *
 * @member {string}
 */
const weights = /* wgsl */ `
// Decodes two binary values from a single bilinear-filtered fetch: taps at a
// 0.25 offset make the R and G edges land on distinguishable values
// (0.25 or 1.0, and 0.75 or 1.0).
fn smaaDecodeDiagBilinearAccessVec2(e: vec2f) -> vec2f {
  return smaaRoundVec2(vec2f(e.r * abs(5.0 * e.r - 3.75), e.g));
}
fn smaaDecodeDiagBilinearAccessVec4(e: vec4f) -> vec4f {
  return smaaRoundVec4(vec4f(
    e.r * abs(5.0 * e.r - 3.75),
    e.g,
    e.b * abs(5.0 * e.b - 3.75),
    e.a
  ));
}

fn smaaSearchDiag1(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  texelSize: vec2f,
  texCoord: vec2f,
  dir: vec2f,
  edgeOut: ptr<function, vec2f>
) -> vec2f {
  var coord = vec4f(texCoord, -1.0, 1.0);
  var edge = vec2f(0.0);
  let t = vec3f(texelSize, 1.0);

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(coord.z < f32(SMAA_MAX_SEARCH_STEPS_DIAG - 1) && coord.w > 0.9)) {
      break;
    }
    let next = t * vec3f(dir, 1.0) + coord.xyz;
    coord = vec4f(next, coord.w);
    edge = textureSampleLevel(edgesTex, edgesSampler, coord.xy, 0.0).rg;
    coord.w = dot(edge, vec2f(0.5));
  }

  *edgeOut = edge;
  return coord.zw;
}

fn smaaSearchDiag2(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  texelSize: vec2f,
  texCoord: vec2f,
  dir: vec2f,
  edgeOut: ptr<function, vec2f>
) -> vec2f {
  // Offset by a quarter texel so both crossing edges come back in one
  // bilinear fetch (@SearchDiag2Optimization).
  var coord = vec4f(texCoord.x + 0.25 * texelSize.x, texCoord.y, -1.0, 1.0);
  var edge = vec2f(0.0);
  let t = vec3f(texelSize, 1.0);

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(coord.z < f32(SMAA_MAX_SEARCH_STEPS_DIAG - 1) && coord.w > 0.9)) {
      break;
    }
    let next = t * vec3f(dir, 1.0) + coord.xyz;
    coord = vec4f(next, coord.w);
    edge = smaaDecodeDiagBilinearAccessVec2(
      textureSampleLevel(edgesTex, edgesSampler, coord.xy, 0.0).rg
    );
    coord.w = dot(edge, vec2f(0.5));
  }

  *edgeOut = edge;
  return coord.zw;
}

fn smaaAreaDiag(areaTex: texture_2d<f32>, areaSampler: sampler, dist: vec2f, e: vec2f, offset: f32) -> vec2f {
  var texCoord = vec2f(SMAA_AREATEX_MAX_DISTANCE_DIAG) * e + dist;

  // Scale and bias to texel space
  texCoord = SMAA_AREATEX_PIXEL_SIZE * texCoord + 0.5 * SMAA_AREATEX_PIXEL_SIZE;
  // Diagonal areas live in the second half of the texture
  texCoord.x += 0.5;
  // Move to the subpixel offset's row
  texCoord.y += SMAA_AREATEX_SUBTEX_SIZE * offset;

  return textureSampleLevel(areaTex, areaSampler, texCoord, 0.0).rg;
}

fn smaaCalculateDiagWeights(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  areaTex: texture_2d<f32>,
  areaSampler: sampler,
  texelSize: vec2f,
  texCoord: vec2f,
  e: vec2f,
  subsampleIndices: vec4f
) -> vec2f {
  var weights = vec2f(0.0);
  var d = vec4f(0.0);
  var end = vec2f(0.0);

  if (e.r > 0.0) {
    let search = smaaSearchDiag1(edgesTex, edgesSampler, texelSize, texCoord, vec2f(-1.0, 1.0), &end);
    d.x = search.x + f32(end.y > 0.9);
    d.z = search.y;
  }
  let search2 = smaaSearchDiag1(edgesTex, edgesSampler, texelSize, texCoord, vec2f(1.0, -1.0), &end);
  d.y = search2.x;
  d.w = search2.y;

  if (d.x + d.y > 2.0) { // d.x + d.y + 1 > 3
    let coords = vec4f(-d.x + 0.25, d.x, d.y, -d.y - 0.25) * vec4f(texelSize, texelSize) + texCoord.xyxy;

    var c = vec4f(0.0);
    let c0 = smaaSampleOffset(edgesTex, edgesSampler, texelSize, coords.xy, vec2f(-1.0, 0.0)).rg;
    let c1 = smaaSampleOffset(edgesTex, edgesSampler, texelSize, coords.zw, vec2f(1.0, 0.0)).rg;
    let decoded = smaaDecodeDiagBilinearAccessVec4(vec4f(c0, c1));
    c = vec4f(decoded.y, decoded.x, decoded.w, decoded.z);

    // Merge the crossing edges at each side into a single value, dropping it
    // where the line end was never found.
    var cc = vec2f(2.0) * c.xz + c.yw;
    cc = select(cc, vec2f(0.0), step(vec2f(0.9), d.zw) != vec2f(0.0));

    weights += smaaAreaDiag(areaTex, areaSampler, d.xy, cc, subsampleIndices.z);
  }

  let search3 = smaaSearchDiag2(edgesTex, edgesSampler, texelSize, texCoord, vec2f(-1.0, -1.0), &end);
  d.x = search3.x;
  d.z = search3.y;

  if (smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord, vec2f(1.0, 0.0)).r > 0.0) {
    let search4 = smaaSearchDiag2(edgesTex, edgesSampler, texelSize, texCoord, vec2f(1.0, 1.0), &end);
    d.y = search4.x + f32(end.y > 0.9);
    d.w = search4.y;
  } else {
    d.y = 0.0;
    d.w = 0.0;
  }

  if (d.x + d.y > 2.0) {
    let coords = vec4f(-d.x, -d.x, d.y, d.y) * vec4f(texelSize, texelSize) + texCoord.xyxy;

    let cx = smaaSampleOffset(edgesTex, edgesSampler, texelSize, coords.xy, vec2f(-1.0, 0.0)).g;
    let cy = smaaSampleOffset(edgesTex, edgesSampler, texelSize, coords.xy, vec2f(0.0, -1.0)).r;
    let czw = smaaSampleOffset(edgesTex, edgesSampler, texelSize, coords.zw, vec2f(1.0, 0.0)).gr;
    let c = vec4f(cx, cy, czw);

    var cc = vec2f(2.0) * c.xz + c.yw;
    cc = select(cc, vec2f(0.0), step(vec2f(0.9), d.zw) != vec2f(0.0));

    weights += smaaAreaDiag(areaTex, areaSampler, d.xy, cc, subsampleIndices.w).gr;
  }

  return weights;
}

// How much length to add in the last step of a search: takes the bilinearly
// interpolated edge (@PSEUDO_GATHER4) and adds 0, 1 or 2.
fn smaaSearchLength(searchTex: texture_2d<f32>, searchSampler: sampler, e: vec2f, offset: f32) -> f32 {
  // The texture is flipped vertically, with left and right cases taking half
  // the space horizontally.
  var scale = SMAA_SEARCHTEX_SIZE * vec2f(0.5, -1.0);
  var bias = SMAA_SEARCHTEX_SIZE * vec2f(offset, 1.0);

  // Scale and bias to texel centers
  scale += vec2f(-1.0, 1.0);
  bias += vec2f(0.5, -0.5);

  // Pixel coordinates to texcoords (the texture is cropped, hence the packed size)
  scale /= SMAA_SEARCHTEX_PACKED_SIZE;
  bias /= SMAA_SEARCHTEX_PACKED_SIZE;

  return textureSampleLevel(searchTex, searchSampler, scale * e + bias, 0.0).r;
}

fn smaaSearchXLeft(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  searchTex: texture_2d<f32>,
  searchSampler: sampler,
  texelSize: vec2f,
  texCoordIn: vec2f,
  end: f32
) -> f32 {
  var texCoord = texCoordIn;
  var e = vec2f(0.0, 1.0);

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(texCoord.x > end && e.g > 0.8281 && e.r == 0.0)) {
      break;
    }
    e = textureSampleLevel(edgesTex, edgesSampler, texCoord, 0.0).rg;
    texCoord -= vec2f(2.0, 0.0) * texelSize;
  }

  let offset = -(255.0 / 127.0) * smaaSearchLength(searchTex, searchSampler, e, 0.0) + 3.25;
  return texelSize.x * offset + texCoord.x;
}

fn smaaSearchXRight(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  searchTex: texture_2d<f32>,
  searchSampler: sampler,
  texelSize: vec2f,
  texCoordIn: vec2f,
  end: f32
) -> f32 {
  var texCoord = texCoordIn;
  var e = vec2f(0.0, 1.0);

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(texCoord.x < end && e.g > 0.8281 && e.r == 0.0)) {
      break;
    }
    e = textureSampleLevel(edgesTex, edgesSampler, texCoord, 0.0).rg;
    texCoord += vec2f(2.0, 0.0) * texelSize;
  }

  let offset = -(255.0 / 127.0) * smaaSearchLength(searchTex, searchSampler, e, 0.5) + 3.25;
  return -texelSize.x * offset + texCoord.x;
}

fn smaaSearchYUp(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  searchTex: texture_2d<f32>,
  searchSampler: sampler,
  texelSize: vec2f,
  texCoordIn: vec2f,
  end: f32
) -> f32 {
  var texCoord = texCoordIn;
  var e = vec2f(1.0, 0.0);

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(texCoord.y > end && e.r > 0.8281 && e.g == 0.0)) {
      break;
    }
    e = textureSampleLevel(edgesTex, edgesSampler, texCoord, 0.0).rg;
    texCoord -= vec2f(0.0, 2.0) * texelSize;
  }

  let offset = -(255.0 / 127.0) * smaaSearchLength(searchTex, searchSampler, e.gr, 0.0) + 3.25;
  return texelSize.y * offset + texCoord.y;
}

fn smaaSearchYDown(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  searchTex: texture_2d<f32>,
  searchSampler: sampler,
  texelSize: vec2f,
  texCoordIn: vec2f,
  end: f32
) -> f32 {
  var texCoord = texCoordIn;
  var e = vec2f(1.0, 0.0);

  for (var i = 0; i < SMAA_MAX_SEARCH_STEPS; i++) {
    if (!(texCoord.y < end && e.r > 0.8281 && e.g == 0.0)) {
      break;
    }
    e = textureSampleLevel(edgesTex, edgesSampler, texCoord, 0.0).rg;
    texCoord += vec2f(0.0, 2.0) * texelSize;
  }

  let offset = -(255.0 / 127.0) * smaaSearchLength(searchTex, searchSampler, e.gr, 0.5) + 3.25;
  return -texelSize.y * offset + texCoord.y;
}

// The distance and both crossing edges are known: look up the area at each
// side of the current edge.
fn smaaArea(areaTex: texture_2d<f32>, areaSampler: sampler, dist: vec2f, e1: f32, e2: f32, offset: f32) -> vec2f {
  // Rounding prevents precision errors of bilinear filtering
  var texCoord = vec2f(SMAA_AREATEX_MAX_DISTANCE) * smaaRoundVec2(4.0 * vec2f(e1, e2)) + dist;

  texCoord = SMAA_AREATEX_PIXEL_SIZE * texCoord + 0.5 * SMAA_AREATEX_PIXEL_SIZE;
  texCoord.y = SMAA_AREATEX_SUBTEX_SIZE * offset + texCoord.y;

  return textureSampleLevel(areaTex, areaSampler, texCoord, 0.0).rg;
}

fn smaaDetectHorizontalCornerPattern(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  texelSize: vec2f,
  weights: vec2f,
  texCoord: vec4f,
  d: vec2f
) -> vec2f {
  if (SMAA_DISABLE_CORNER_DETECTION) {
    return weights;
  }

  let leftRight = step(d.xy, d.yx);
  // Reduce blending for pixels in the center of a line
  let rounding = ((1.0 - f32(SMAA_CORNER_ROUNDING) / 100.0) * leftRight) / (leftRight.x + leftRight.y);

  var factor = vec2f(1.0);
  factor.x -= rounding.x * smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord.xy, vec2f(0.0, 1.0)).r;
  factor.x -= rounding.y * smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord.zw, vec2f(1.0, 1.0)).r;
  factor.y -= rounding.x * smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord.xy, vec2f(0.0, -2.0)).r;
  factor.y -= rounding.y * smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord.zw, vec2f(1.0, -2.0)).r;

  return weights * saturateVec2(factor);
}

fn smaaDetectVerticalCornerPattern(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  texelSize: vec2f,
  weights: vec2f,
  texCoord: vec4f,
  d: vec2f
) -> vec2f {
  if (SMAA_DISABLE_CORNER_DETECTION) {
    return weights;
  }

  let leftRight = step(d.xy, d.yx);
  let rounding = ((1.0 - f32(SMAA_CORNER_ROUNDING) / 100.0) * leftRight) / (leftRight.x + leftRight.y);

  var factor = vec2f(1.0);
  factor.x -= rounding.x * smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord.xy, vec2f(1.0, 0.0)).g;
  factor.x -= rounding.y * smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord.zw, vec2f(1.0, 1.0)).g;
  factor.y -= rounding.x * smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord.xy, vec2f(-2.0, 0.0)).g;
  factor.y -= rounding.y * smaaSampleOffset(edgesTex, edgesSampler, texelSize, texCoord.zw, vec2f(-2.0, 1.0)).g;

  return weights * saturateVec2(factor);
}

fn smaaBlendingWeightCalculation(
  edgesTex: texture_2d<f32>,
  edgesSampler: sampler,
  areaTex: texture_2d<f32>,
  areaSampler: sampler,
  searchTex: texture_2d<f32>,
  searchSampler: sampler,
  viewportSize: vec2f,
  texelSize: vec2f,
  texCoord: vec2f,
  pixCoord: vec2f,
  offset0: vec4f,
  offset1: vec4f,
  offset2: vec4f,
  subsampleIndices: vec4f
) -> vec4f {
  var weights = vec4f(0.0);
  var e = textureSampleLevel(edgesTex, edgesSampler, texCoord, 0.0).rg;

  if (e.g > 0.0) { // Edge at north
    var horizontal = true;

    if (!SMAA_DISABLE_DIAG_DETECTION) {
      // Diagonals have both north and west edges, so searching one boundary
      // is enough. They take priority: a diagonal skips horizontal/vertical.
      let diagonal = smaaCalculateDiagWeights(
        edgesTex, edgesSampler, areaTex, areaSampler, texelSize, texCoord, e, subsampleIndices
      );
      weights = vec4f(diagonal, weights.ba);
      horizontal = weights.r == -weights.g; // weights.r + weights.g == 0.0
      if (!horizontal) {
        e.r = 0.0; // Skip vertical processing
      }
    }

    if (horizontal) {
      // Distance to the left. The crossing offset (-0.25) lets one bilinear
      // fetch discern what value each edge has (@CROSSING_OFFSET).
      var coords = vec3f(
        smaaSearchXLeft(edgesTex, edgesSampler, searchTex, searchSampler, texelSize, offset0.xy, offset2.x),
        offset1.y,
        0.0
      );
      let e1 = textureSampleLevel(edgesTex, edgesSampler, coords.xy, 0.0).r;

      coords.z = smaaSearchXRight(edgesTex, edgesSampler, searchTex, searchSampler, texelSize, offset0.zw, offset2.y);

      // In pixel units, so the area texture's quadratic compression applies
      let d = abs(smaaRoundVec2(viewportSize.xx * vec2f(coords.x, coords.z) - pixCoord.xx));
      let e2 = smaaSampleOffset(edgesTex, edgesSampler, texelSize, vec2f(coords.z, coords.y), vec2f(1.0, 0.0)).r;

      var horizontalWeights = smaaArea(areaTex, areaSampler, sqrt(d), e1, e2, subsampleIndices.y);
      horizontalWeights = smaaDetectHorizontalCornerPattern(
        edgesTex, edgesSampler, texelSize, horizontalWeights,
        vec4f(coords.x, texCoord.y, coords.z, texCoord.y), d
      );
      weights = vec4f(horizontalWeights, weights.ba);
    }
  }

  if (e.r > 0.0) { // Edge at west
    var coords = vec3f(
      offset0.x,
      smaaSearchYUp(edgesTex, edgesSampler, searchTex, searchSampler, texelSize, offset1.xy, offset2.z),
      0.0
    );
    let e1 = textureSampleLevel(edgesTex, edgesSampler, coords.xy, 0.0).g;

    coords.z = smaaSearchYDown(edgesTex, edgesSampler, searchTex, searchSampler, texelSize, offset1.zw, offset2.w);

    let d = abs(smaaRoundVec2(viewportSize.yy * vec2f(coords.y, coords.z) - pixCoord.yy));
    let e2 = smaaSampleOffset(edgesTex, edgesSampler, texelSize, vec2f(coords.x, coords.z), vec2f(0.0, 1.0)).g;

    var verticalWeights = smaaArea(areaTex, areaSampler, sqrt(d), e1, e2, subsampleIndices.x);
    verticalWeights = smaaDetectVerticalCornerPattern(
      edgesTex, edgesSampler, texelSize, verticalWeights,
      vec4f(texCoord.x, coords.y, texCoord.x, coords.z), d
    );
    weights = vec4f(weights.rg, verticalWeights);
  }

  return weights;
}
`;

/**
 * Pass 3: neighborhood blending. Mixes the pixel with the neighbor its
 * blending weight points at, exploiting bilinear filtering to do it in one tap
 * per direction.
 *
 * Requires {@link common}.
 *
 * @member {string}
 */
const blend = /* wgsl */ `
fn smaaNeighborhoodBlending(
  colorTex: texture_2d<f32>,
  colorSampler: sampler,
  blendTex: texture_2d<f32>,
  blendSampler: sampler,
  texelSize: vec2f,
  texCoord: vec2f,
  offset: vec4f
) -> vec4f {
  // Blending weights for the current pixel
  let bottomLeft = textureSampleLevel(blendTex, blendSampler, texCoord, 0.0);
  let a = vec4f(
    textureSampleLevel(blendTex, blendSampler, offset.xy, 0.0).a, // Right
    textureSampleLevel(blendTex, blendSampler, offset.zw, 0.0).g, // Top
    bottomLeft.z, // Left
    bottomLeft.x // Bottom
  );

  if (dot(a, vec4f(1.0)) <= 1e-5) {
    return textureSampleLevel(colorTex, colorSampler, texCoord, 0.0);
  }

  let h = max(a.x, a.z) > max(a.y, a.w); // max(horizontal) > max(vertical)

  let blendingOffset = select(vec4f(0.0, a.y, 0.0, a.w), vec4f(a.x, 0.0, a.z, 0.0), h);
  var blendingWeight = select(a.yw, a.xz, h);
  blendingWeight /= dot(blendingWeight, vec2f(1.0));

  let blendingCoord = blendingOffset * vec4f(texelSize, -texelSize) + texCoord.xyxy;

  // Bilinear filtering mixes the current pixel with the chosen neighbor
  return blendingWeight.x * textureSampleLevel(colorTex, colorSampler, blendingCoord.xy, 0.0) +
    blendingWeight.y * textureSampleLevel(colorTex, colorSampler, blendingCoord.zw, 0.0);
}
`;

export { common, edges, weights, blend };
