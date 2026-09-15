/**
 * Depth of Field
 *
 * Tile-based scatter-as-gather at half resolution, near and far fields
 * separated: prefilter colour and circle of confusion together, reduce the
 * circle of confusion to a coarse grid, gather each field over the span it
 * needs, composite back at full resolution.
 *
 * The arrangement production depth of field converged on — Jimenez, "Next
 * Generation Post Processing in Call of Duty: Advanced Warfare" (SIGGRAPH
 * 2014), Unity's HDRP, AMD's FidelityFX Depth of Field. The reasons are
 * structural rather than about cost:
 *
 * - **Scatter as gather.** Testing per tap whether *that tap's* disc reaches
 *   here means an in-focus pixel has no disc and cannot leak onto a defocused
 *   neighbour, and normalising by the weights that did reach reconstructs the
 *   background behind a foreground object. A tap's weight is the inverse of its
 *   own disc area, which is the half of scattering a gather otherwise loses:
 *   what a source delivers per destination is what makes a near field cover its
 *   own disc rather than everything the tile can see.
 * - **Near and far are different problems.** The far field composites by the
 *   destination's own defocus, the near field by its own coverage. One image
 *   cannot carry both.
 * - **Tiles bound the near search.** A foreground scatters in from wherever it
 *   is, so only the neighbourhood knows how far to look. The far field's limit
 *   is the destination's own defocus instead.
 * - **The highlight boost belongs in the prefilter.** Per tap it is computed
 *   per destination, so one bright source is boosted differently by every pixel
 *   gathering it and the disc redraws itself as the image moves.
 *
 * Circles of confusion are signed and in half-resolution pixels of radius
 * throughout: positive in front of the focal plane, negative behind it.
 * Distances are millimetres, the unit the thin lens model works in.
 *
 * Split into the passes rather than shipped whole, since most of them share
 * only the parameter block: the tile reduction and the mip chain touch neither
 * depth nor a circle of confusion, and the post filter needs no more than a
 * luminance. Each member names what it requires.
 *
 * Sources
 *
 * Pinned, and every claim below names the symbol it comes from.
 *
 * - Jorge Jimenez, "Next Generation Post Processing in Call of Duty: Advanced
 *   Warfare", SIGGRAPH 2014.
 *   https://advances.realtimerendering.com/s2014/index.html
 *   Scatter as gather at half resolution, the near and far fields as separate
 *   images, and the coarse grid that bounds the near search.
 *
 * - AMD FidelityFX Depth of Field v1.1.2, `ffx_dof_blur.h`,
 *   `ffx_dof_downsample_color.h`, `ffx_dof_composite.h`.
 *   https://github.com/GPUOpen-LibrariesAndSDKs/FidelityFX-SDK/tree/v1.1.2/sdk/include/FidelityFX/gpu/dof
 *   The arrangement here, closest of the four: one gather pass feeding both
 *   fields, a mip chain that carries one texel's radius per block while
 *   filtering colour bilaterally against it (`FfxDofDownsampleQuadH`), the
 *   inverse-disc-area sample weight (`FfxDofWeight`, written there as
 *   `1/(4r^2)` for speed where this uses the real pi), the near coverage that
 *   normalises against it (`fgOpacity`, `acc.nearColor.a / (FfxDofWeight(coc =
 *   tileCoc) * nSamples)`, taken as it is), the outside-in ring bucket ordering
 *   and the annulus-overlap geometry of the merge (`FfxDofMergeBuckets` — the
 *   geometry only; how full the occluding band is comes from HDRP, below),
 *   per-tile radii, one integer mip level for the whole kernel
 *   (`FfxDofSampleInput`), and the cubic the near field is composited through
 *   (`FfxCubicSpline`).
 *
 * - Unity HDRP. Two depth of field implementations live in that one folder and
 *   this borrows from both; they are not one algorithm, and a symbol from one
 *   will not be found in the other.
 *   https://github.com/Unity-Technologies/Graphics/tree/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Runtime/PostProcessing/Shaders
 *   Physically based path, the `DoF*` files — `DoFGatherUtils.hlsl`,
 *   `DoFCoCMinMax.compute`, `DoFGather.compute`: the far field's search bounded
 *   by the destination's own defocus (`LoadTileData`, `limit =
 *   min(maxFarCoC, 2 * abs(centerSample.CoC))` — the factor of two deliberately
 *   not carried over, see below), the ring occlusion measured by weight rather
 *   than by sample count (`ringOpacity`, and the early return on a ring that
 *   carries none — see `occluding` in {@link gather} for why the count is the
 *   wrong measure), a tile carrying each field's smallest
 *   radius alongside its largest with a sentinel for a field it does not hold
 *   (`InitMinMaxTile`, `BIG_NUMBER` 1200), and the ring count scaled by how
 *   uniform the tile is (`ADAPTIVE_SAMPLING`, direction inverted here — see
 *   below).
 *   Classic path, the `DepthOfField*` files — `DepthOfFieldGather.compute`:
 *   near and far as separate kernels over separate spans (`KMainNear`,
 *   `KMainFar`), and a near coverage ramped by `smoothstep` before use.
 *   Common to both: a radius loaded unfiltered while colour is sampled
 *   filtered, and a near gather that reads the chain at `mip = 0.0` because a
 *   coarse level cannot describe a silhouette.
 *
 * - Unity post-processing stack v2,
 *   `PostProcessing/Shaders/Builtins/DepthOfField.hlsl`.
 *   https://github.com/Unity-Technologies/PostProcessing/blob/v2/PostProcessing/Shaders/Builtins/DepthOfField.hlsl
 *   `bgCoC = max(min(samp0.a, samp.a), 0)` against `fgWeight`: the far field
 *   tests the destination's own defocus, the near field the tap's own. Sign
 *   convention there, and in both HDRP paths, is the opposite of this one —
 *   near is negative in all three, positive here.
 *
 * Deviations
 *
 * Ordered by what depends on what. The first is structural and most of the rest
 * follow from it.
 *
 * - **Ring occlusion is a hybrid, deliberately.** The bucket ordering and the
 *   annulus geometry are FidelityFX's; how much the occluding band attenuates
 *   is HDRP's `ringOpacity`, the weight it carries over the weight a full ring
 *   at its own radius would. FidelityFX uses the sample count
 *   (`currBucket.sampleCount / ringSamples`), which charges for taps that reach
 *   nothing: an in-focus surface, or a background too near the focal plane to
 *   span the distance, carries no colour and is already absent from the
 *   normalisation. Measured against a sharp occluder, where the correct
 *   contribution is zero, the count form rims the silhouette with a band as
 *   wide as two thirds of the gather and inverts sign across it; the weighted
 *   form measures zero. Where occlusion belongs — two backgrounds at different
 *   depths — the weighted form still acts, and its reach follows the front
 *   layer's own radius instead of ignoring it.
 * - **A kernel per field, inside one pass.** FidelityFX runs one kernel sized
 *   to `max(nearTile, farTile)` and uses it for both loops
 *   (`ffx_dof_blur.h`, `tileRad`, `ins.tileCoc`); HDRP's physically based path
 *   does the same. HDRP's classic path gives each field its own span but pays
 *   for it with a dispatch each (`DepthOfFieldGather.compute`, `KMainNear` and
 *   `KMainFar`). This takes the classic path's spans and FidelityFX's single
 *   pass. Sharing a kernel makes a foreground sharper than the background
 *   behind it fall off in plateaus one ring apart, because its whole disc gets
 *   the two or three innermost rings of a kernel sized for something else.
 *   What it costs: both fields draw on one ring budget, where the two-pass form
 *   would size them separately.
 * - **The near field's span is the dilated tile, the far field's is the pixel's
 *   own defocus.** Not a deviation — `DepthOfFieldGather.compute` reads
 *   `_InputDilatedCoCTexture` under `NEAR` and `_InputCoCTexture` under `FAR`.
 *   What is not carried over is the physically based path's
 *   `limit = min(maxFarCoC, 2 * abs(centerSample.CoC))` (`LoadTileData`), and
 *   only because the factor of two means something different there: with one
 *   shared kernel the far span decides which taps are accepted, so widening it
 *   costs nothing; here it is the kernel radius, so doubling it would put half
 *   the rings in an annulus the acceptance test is about to reject anyway.
 * - **`ringGap` is not carried over, and the mip level is rounded up.** It
 *   feathers FidelityFX's acceptance test over the pixels an under-sampled
 *   kernel steps across. It is near enough free there because their cap never
 *   binds — the sample ships `quality = 10` rings against a `cocLimit` of
 *   `0.5 * 0.01 * 1080`, so about 5.4 pixels of radius and 6 rings asked of 10.
 *   Here the cap binds routinely, and a feather that widens with the gap
 *   over-covers badly. Rounding the level up closes the same gap.
 *   The near field keeps FidelityFX's half pixel (`rangeThreshNear`). The far
 *   field takes a whole one where they take none, which the clamp below forces:
 *   see `DOF_FAR_FEATHER` in {@link gather}.
 * - **Adaptive sampling runs the other way.** HDRP's mechanism is
 *   `lerp(AdaptiveSamplingWeights.xy, minRadius / maxRadius)`, and the pipeline
 *   packs that vector as `(min(w, 1), max(w, 1))` with `w` defaulting to 0.75 —
 *   so by default a mixed tile gets *fewer* samples and only a uniform one can
 *   be given more. This spends the extra rings on the mixed tile instead, which
 *   is where the near coverage measurably follows the tile grid. See
 *   `DOF_RING_SCALE` in {@link gather} for the numbers and the caveat. The
 *   direction only matters because the cap binds, above.
 * - **The far field carries no edge expansion.** Both this and FidelityFX
 *   normalise the far field in the gather (`ffTarget = acc.prevBucket.color /
 *   acc.prevBucket.color.a`), so the stored alpha is one wherever the field has
 *   content. Bilinear upsampling at the composite then mixes written texels
 *   with unwritten ones, which FidelityFX repairs by dividing through the
 *   interpolated alpha a second time (`ffx_dof_composite.h`, "expand background
 *   around edges"). Here the unwritten texel is seeded with the sharp colour
 *   instead, so the same boundary interpolates towards the image rather than
 *   towards nothing. Cheaper, and one fewer divide; slightly under-weights the
 *   far field over the one texel where the two blend.
 * - **The transition blur scales with the circle of confusion.**
 *   FidelityFX crossfades to a fixed-width 3x3 (`FfxDofBlur3x3`, coefficients
 *   0.5453 and 0.9717) over the same two handovers this uses (`c1`, `c2` there;
 *   `toTransition`, `toField` here). Four bilinear taps that widen with the
 *   radius track the growth of the disc across the range where neither the
 *   sharp image nor a half-resolution gather describes it, at the cost of not
 *   being a fixed kernel.
 *
 *
 * @type {object}
 * @name depthOfField
 * @static
 */

/**
 * The parameter block. Every other member builds on it, and it is all the
 * gather needs — that pass works from a prefiltered circle of confusion and
 * never touches depth.
 *
 * @member {string}
 */
const common = /* wgsl */ `
struct DepthOfFieldParams {
  // Full-resolution grid.
  texelSize: vec2f,
  // The grid every pass but the composite rasterizes into.
  halfTexelSize: vec2f,
  // Where autofocus reads, in UV.
  screenPoint: vec2f,
  // Half-resolution UV to tile-grid UV. The tile grid is a whole number of
  // tiles, so it covers at least the image and generally more; addressing it
  // with the image's own UV would drift by up to a tile towards the far edge.
  tileScale: vec2f,
  near: f32,
  far: f32,
  // mm. Overridden by the autofocus pass when there is one.
  focusDistance: f32,

  // Physical model: a thin lens, from the camera's own optics.
  focalLength: f32, // mm
  fStop: f32,
  // Circle of confusion diameter on the sensor, in mm, to half-resolution
  // pixels of radius: viewportHeight * 0.25 / sensorHeight.
  cocScale: f32,
  // Plain multiplier on the result, for a shot that wants more than the lens
  // gives.
  focusScale: f32,

  // Artistic model: how blurry, how deep, how sharply it ramps.
  // Circle of confusion radius reached at infinity, in half-resolution pixels.
  blurScale: f32,
  // Depth of the in-focus zone around focusDistance, in mm. Laid on the same
  // hyperbola as the blur, so the zone is symmetric in that parameter and not
  // in depth: it reaches further behind the subject than in front, and the
  // stated depth only holds while it is small against focusDistance.
  focusRange: f32,
  // Ramp exponent outside that zone. 1 is linear, above holds focus longer then
  // blurs faster, below leaves the zone immediately.
  focusFalloff: f32,

  // Cap, in half-resolution pixels.
  maxCoCRadius: f32,
  // Per-channel displacement of the bokeh, as a fraction of its radius.
  chromaticAberration: f32,
  luminanceThreshold: f32,
  luminanceGain: f32,
  luminanceKnee: f32,
  // Diaphragm blades. Under three there is no polygon and the aperture is round.
  blades: f32,
  bladeRotation: f32,
  bladeCurvature: f32,
}

`;

/**
 * Linear depth, in the millimetres the thin lens model works in. Requires
 * {@link common} and `depthRead`.
 *
 * @member {string}
 */
const depth = /* wgsl */ `
fn dofDepth(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  params: DepthOfFieldParams
) -> f32 {
  // m -> mm
  return readDepth(depthTex, depthSampler, uv, params.near, params.far) * 1000.0;
}
`;

/**
 * Circle of confusion from depth, under either model. Requires {@link common},
 * and {@link depth} for the callers that read it off the depth buffer.
 *
 * @member {string}
 */
const coc = /* wgsl */ `
override USE_DOF_PHYSICAL: bool = true;

// Thin lens: A * f * |z - zf| / (z * (zf - f)), with the aperture diameter
// A = f / N. Signed rather than absolute — which field a pixel belongs to is
// the whole of the separation below.
fn dofCoCPhysical(depth: f32, focusDistance: f32, params: DepthOfFieldParams) -> f32 {
  let f = params.focalLength;
  // Nothing inside the focal length has an image, and the focus distance sits
  // in a denominator.
  let z = max(depth, f + 1e-3);
  let zf = max(focusDistance, f + 1e-3);

  let diameter = (f * f) / (params.fStop * (zf - f)) * (zf - z) / z;

  return diameter * params.cocScale * params.focusScale;
}

// Blur amount, in-focus depth and ramp, for a scene with no camera to speak of.
//
// Laid over the same hyperbola the thin lens traces rather than over depth, so
// an artistic curve still inherits a real lens' asymmetry: the in-focus zone
// reaches further behind the subject than in front of it, and the background
// blur saturates while the foreground's does not.
fn dofCoCArtistic(depth: f32, focusDistance: f32, params: DepthOfFieldParams) -> f32 {
  let zf = max(focusDistance, 1e-3);
  let z = max(depth, 1e-3);

  // -1 at infinity, 0 at the focal plane, unbounded towards the camera.
  let t = (zf - z) / z;
  // Half-width of the in-focus zone in those same units.
  let h = min(params.focusRange * 0.5 / zf, 0.999);

  let ramp = pow(max(abs(t) - h, 0.0) / (1.0 - h), params.focusFalloff);

  return sign(t) * params.blurScale * ramp;
}

// One clamp over both models, so switching between them changes the curve and
// never the scale.
fn dofCoC(depth: f32, focusDistance: f32, params: DepthOfFieldParams) -> f32 {
  let coc = select(
    dofCoCArtistic(depth, focusDistance, params),
    dofCoCPhysical(depth, focusDistance, params),
    USE_DOF_PHYSICAL
  );

  return clamp(coc, -params.maxCoCRadius, params.maxCoCRadius);
}
`;

/**
 * Autofocus: the distance the frame focuses at, read off a screen point.
 * Requires {@link common} and {@link depth}.
 *
 * @member {string}
 */
const focus = /* wgsl */ `
fn dofMedian5(taps: array<f32, 5>) -> f32 {
  var v = taps;

  for (var i = 0; i < 4; i++) {
    for (var j = 0; j < 4 - i; j++) {
      let lo = min(v[j], v[j + 1]);
      let hi = max(v[j], v[j + 1]);
      v[j] = lo;
      v[j + 1] = hi;
    }
  }

  return v[2];
}

// Autofocus over a small cross rather than one texel. A thin object crossing
// the reticle otherwise racks the whole image's focus onto it, and it is the
// median that rejects it — the minimum is exactly the thin object.
fn dofFocusDistance(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  params: DepthOfFieldParams
) -> f32 {
  let o = params.texelSize * 3.0;
  let p = params.screenPoint;

  return dofMedian5(array<f32, 5>(
    dofDepth(depthTex, depthSampler, p, params),
    dofDepth(depthTex, depthSampler, p + vec2f(-o.x, -o.y), params),
    dofDepth(depthTex, depthSampler, p + vec2f(o.x, -o.y), params),
    dofDepth(depthTex, depthSampler, p + vec2f(-o.x, o.y), params),
    dofDepth(depthTex, depthSampler, p + vec2f(o.x, o.y), params)
  ));
}
`;

/**
 * Temporal resolve of the circle of confusion, which a jittered raster needs
 * before anything prefilters it. Requires {@link common}, {@link depth} and
 * {@link coc}.
 *
 * @member {string}
 */
const resolve = /* wgsl */ `
// The range of circles of confusion the pixel's immediate neighbourhood covers.
//
// Both models are monotonically decreasing in depth, so the neighbourhood's
// extremes are the extremes of its depth: nine depth taps, two evaluations.
fn dofCoCRange(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  focusDistance: f32,
  params: DepthOfFieldParams
) -> vec2f {
  var nearest = 3.4e38;
  var furthest = 0.0;

  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let offset = vec2f(f32(x), f32(y)) * params.texelSize;
      let depth = dofDepth(depthTex, depthSampler, uv + offset, params);
      nearest = min(nearest, depth);
      furthest = max(furthest, depth);
    }
  }

  return vec2f(
    dofCoC(furthest, focusDistance, params),
    dofCoC(nearest, focusDistance, params)
  );
}

// One frame of the circle of confusion accumulated into the jitter sequence.
//
// A depth texel at a silhouette holds a different surface every frame, and
// nothing can shift it back: the buffer holds one point sample per texel, and a
// sub-texel offset is a no-op against a point sampler. Every consumer here is a
// hard function of it — the prefilter's bilateral weight, the reference it keys
// on, the tile maximum — so sub-pixel depth becomes a discrete change of
// colour, of gather radius and of mip level.
//
// Accumulating converges on the coverage-weighted mean instead, which is the
// right answer for an edge pixel that is a mixture of two surfaces.
//
// Clamping to the neighbourhood bounds the lag as well as the ghosting: racking
// focus moves the local range, and the history is forced into it that frame.
fn dofResolveCoC(
  current: f32,
  range: vec2f,
  history: f32,
  historyValid: f32,
  blendFactor: f32
) -> f32 {
  let clamped = clamp(history, range.x, range.y);

  // Nothing to continue: take this frame whole rather than blending towards it
  // from a texture that holds another view.
  return mix(clamped, current, max(blendFactor, 1.0 - historyValid));
}
`;

/**
 * The prefilter's mip chain, and the bilateral weight it shares with the
 * prefilter itself. Needs neither depth nor the parameters — a level is a
 * filter over colour and a circle of confusion that are already computed.
 * Requires `math.saturate`.
 *
 * @member {string}
 */
const downsample = /* wgsl */ `
// How much a texel belongs with the one that will represent its block.
//
// Relative rather than absolute: the texels compared are one half-resolution
// pixel apart at level 0 and 2^N apart at level N, so a fixed tolerance that
// holds a smooth gradient together at the top of the chain rejects it at the
// bottom and leaves the filter point-sampling a reference texel.
fn dofBilateralWeight(coc: f32, reference: f32) -> f32 {
  return saturateF32(1.0 - abs(coc - reference) / max(abs(reference), 1.0));
}

// One level of the prefilter's chain, bilateral on the same rule.
//
// A box filter would average the circle of confusion along with the colour, so
// a coarse texel straddling a silhouette reports a radius between the two
// surfaces' and the gather spreads the sharp one as though it had the blurry
// one's disc. One texel of the block stands for it instead, and the colour is
// averaged only over the texels agreeing with that one.
//
// A fixed texel, not the largest radius in the block. Taking the largest looks
// like it protects the far field — a sharp foreground against a defocused
// background drops out of the coarse levels — but it is a dilation, and in the
// near field it runs the wrong way: a defocused foreground is promoted over a
// whole 2^N block that is mostly background, so the gather reads a foreground
// where there is none and the near field reaches its own radius plus the block.
// Nothing needs the largest, because a tap standing for the wrong surface
// rejects itself: its radius is small, so it spreads nowhere.
//
// The stored radius is in half-resolution pixels at every level. It says how
// far that content reaches on screen, not how big the texel recording it got.
fn dofDownsample(tex: texture_2d<f32>, texSampler: sampler, texCoord: vec2f) -> vec4f {
  let texelSize = 1.0 / vec2f(textureDimensions(tex));

  var offsets = array<vec2f, 4>(
    vec2f(-0.5, -0.5),
    vec2f(0.5, -0.5),
    vec2f(-0.5, 0.5),
    vec2f(0.5, 0.5)
  );

  var taps = array<vec4f, 4>();

  for (var i = 0; i < 4; i++) {
    taps[i] = textureSampleLevel(tex, texSampler, texCoord + offsets[i] * texelSize, 0.0);
  }

  let reference = taps[0].a;

  var color = vec3f(0.0);
  var weight = 0.0;

  for (var i = 0; i < 4; i++) {
    let w = dofBilateralWeight(taps[i].a, reference);
    color += taps[i].rgb * w;
    weight += w;
  }

  // The reference weighs 1, so this can never divide by zero.
  return vec4f(color / weight, reference);
}
`;

/**
 * Half-resolution colour and circle of confusion in one texture. Requires
 * {@link common}, {@link depth}, {@link coc}, {@link downsample},
 * `math.saturate`, `luma` and `threshold`.
 *
 * @member {string}
 */
const prefilter = /* wgsl */ `
// The four full-resolution texels that fall under one half-resolution texel.
fn dofQuadOffset(i: i32) -> vec2f {
  return vec2f(f32(i % 2) * 2.0 - 1.0, f32(i / 2) * 2.0 - 1.0) * 0.5;
}

// Straight from depth, for a frame whose raster carries no sub-pixel offset.
fn dofCoCQuadFromDepth(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  texCoord: vec2f,
  focusDistance: f32,
  params: DepthOfFieldParams
) -> array<f32, 4> {
  var cocs = array<f32, 4>();

  for (var i = 0; i < 4; i++) {
    let uv = texCoord + dofQuadOffset(i) * params.texelSize;
    cocs[i] = dofCoC(dofDepth(depthTex, depthSampler, uv, params), focusDistance, params);
  }

  return cocs;
}

// From the resolved texture. Point sampled: already at full resolution, and
// interpolating would round the silhouettes it just resolved.
fn dofCoCQuadFromTexture(
  cocTex: texture_2d<f32>,
  cocSampler: sampler,
  texCoord: vec2f,
  params: DepthOfFieldParams
) -> array<f32, 4> {
  var cocs = array<f32, 4>();

  for (var i = 0; i < 4; i++) {
    let uv = texCoord + dofQuadOffset(i) * params.texelSize;
    cocs[i] = textureSampleLevel(cocTex, cocSampler, uv, 0.0).r;
  }

  return cocs;
}

// Half-resolution colour and circle of confusion in one texture: rgb is what
// the gather spreads, a the signed radius deciding how far.
//
// Bilateral, keyed on the circle of confusion rather than on depth: averaging
// a sharp foreground into a defocused background is what makes a silhouette
// leak. One texel of the quad stands for the block and the colour is averaged
// over those agreeing with it — the rule the chain above runs on, and a fixed
// texel for the same reason.
fn dofPrefilter(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  quad: array<f32, 4>,
  params: DepthOfFieldParams
) -> vec4f {
  // Dynamic indexing needs a var; a parameter binds like a let.
  var cocs = quad;

  var colors = array<vec3f, 4>();

  for (var i = 0; i < 4; i++) {
    let uv = texCoord + dofQuadOffset(i) * params.texelSize;
    colors[i] = textureSampleLevel(tex, texSampler, uv, 0.0).rgb;
  }

  let reference = cocs[0];

  var color = vec3f(0.0);
  var weight = 0.0;

  for (var i = 0; i < 4; i++) {
    let w = dofBilateralWeight(cocs[i], reference);
    color += colors[i] * w;
    weight += w;
  }

  // The reference weighs 1, so this can never divide by zero.
  color /= weight;

  // An artistic punch-up, off by default, and not an energy correction: a
  // normalised gather of unclamped radiance already spreads a highlight over
  // its disc correctly. The boost older depth of field carries exists to undo a
  // clamped pipeline, and nothing here clamps.
  //
  // Thresholded on exposed luma, the units bloom thresholds in, so neither
  // effect silently retargets when exposure changes. Soft-kneed because a
  // circle of confusion is never perfectly steady, and a hard cutoff makes a
  // highlight sitting at the threshold blink rather than fade in.
  let excess = thresholdSoft(
    luma(color),
    params.luminanceThreshold,
    params.luminanceKnee
  );
  // Saturating, so the multiplier approaches 1 + gain. Unbounded it overflows
  // the half-float target the gather normalises through, and one inf in the
  // numerator takes the whole disc to NaN.
  let boost = params.luminanceGain * excess / (1.0 + excess);

  // Ramped over the same half pixel the composite hands the far field over on,
  // so a highlight brightens as it spreads.
  return vec4f(color * (1.0 + boost * saturateF32(abs(reference) - 0.5)), reference);
}
`;

/**
 * The coarse grid that bounds the near field's search, and its dilation.
 * Standalone, like {@link downsample}.
 *
 * @member {string}
 */
const tiles = /* wgsl */ `
override DOF_TILE_SIZE: i32 = 8;

override DOF_TILE_DILATE_RADIUS: i32 = 4;

// Stands in for a field that is absent from the tile, so it loses the smallest
// magnitude below rather than claiming it. Small enough to hold in a half float.
const DOF_TILE_ABSENT: f32 = 1200.0;

// The two fields spread in opposite directions, so a tile carries each as a
// positive magnitude: x near, y far.
//
// Then the same again for the smallest magnitude each field reaches, negated so
// that every channel reduces by the same max. A tile knowing only its largest
// radius cannot say whether it holds one surface or two, and the gather needs
// that: a pixel whose own defocus is a fraction of the tile's is sampled by only
// the innermost rings, and how many of those there are decides whether its
// coverage is an estimate or a guess.
fn dofTileCoC(coc: f32) -> vec4f {
  return vec4f(
    max(coc, 0.0),
    max(-coc, 0.0),
    select(-DOF_TILE_ABSENT, -coc, coc > 0.0),
    select(-DOF_TILE_ABSENT, coc, coc < 0.0)
  );
}
`;

/**
 * The two fields, each gathered over the span it actually needs. Requires
 * {@link common}, `math.PI`, `math.TWO_PI` and `math.saturate`.
 *
 * @member {string}
 */
const gather = /* wgsl */ `
// A cap on the rings, not the ring count. One ring per pixel of radius is what
// resolves a disc exactly, so the count is derived from the radius and this
// only says how much the gather may spend when that is more than affordable —
// FidelityFX's MaxRings against its idealRingCount, and its quality setting.
//
// One per field, because their spans are not comparable: the near field covers
// the dilated tile, the far field one pixel's own defocus. A shared cap starves
// whichever of the two the neighbourhood makes larger, which is the near field
// almost everywhere. HDRP's classic path splits them the same way and for the
// same reason, as nearSampleCount against farSampleCount.
override DOF_NEAR_RINGS: i32 = 8;

override DOF_FAR_RINGS: i32 = 8;

override DOF_SAMPLES: i32 = 6;

override USE_DOF_RING_OCCLUSION: bool = true;

// Ring cap multiplier for a tile holding the widest range of radii, falling to
// one where it holds a single radius.
//
// HDRP's ADAPTIVE_SAMPLING is the same lerp on the same ratio, but its pipeline
// packs the endpoints as (min(w, 1), max(w, 1)) from one knob defaulting to
// 0.75, which spends samples on the uniform tile and economises on the mixed
// one. This is the opposite endpoint, and it is the only constant here chosen
// by measurement rather than taken from a reference: coverage at a silhouette
// varies by 0.34 with the dilated tile maximum alone at a fixed cap of eight,
// and by 0.06 with this, which is what a blanket sixteen buys for the cost of
// the mixed tiles only. Lower it if the extra rings are not worth their cost.
override DOF_RING_SCALE: f32 = 2.0;

// Levels the prefilter actually has, past which there is nothing to read.
override DOF_MAX_MIP: f32 = 4.0;

struct DoFFields {
  far: vec4f,
  near: vec4f,
}

// The smallest radius anything in the tile reaches, over both fields. A field
// absent from the tile carries a sentinel there and cannot win the minimum.
fn dofTileMinRadius(tile: vec4f) -> f32 {
  return min(-tile.z, -tile.w);
}

// Nothing in the tile was written, so there is no range to speak of.
fn dofTileEmpty(tile: vec4f) -> bool {
  return max(tile.x, tile.y) <= 0.0;
}

// The ring layout a span asks for, and the level one tap of it stands for.
struct DoFKernel {
  rings: i32,
  ringCount: f32,
  lod: f32,
}

const DOF_GOLDEN_ANGLE: f32 = 2.39996323;

// Screen-static, and deliberately so: depth of field runs after the temporal
// resolve, so a per-frame rotation has nothing left to average it out and would
// only be noise that moves.
fn dofDither(fragCoord: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(fragCoord, vec2f(0.06711056, 0.00583715))));
}

// Radius of a diaphragm with straight blades, normalized so the blade corners
// sit on the unit circle: apothem over the cosine of the angle from a blade's
// normal.
fn dofBladeRadius(angle: f32, params: DepthOfFieldParams) -> f32 {
  if (params.blades < 3.0) {
    return 1.0;
  }

  let sector = TWO_PI / params.blades;
  let a = angle + params.bladeRotation;
  let offset = a - sector * floor(a / sector) - sector * 0.5;

  return mix(cos(sector * 0.5) / cos(offset), 1.0, params.bladeCurvature);
}

// How much of a source pixel's disc lands on a destination that far away, with
// a feather so a disc grows in rather than switching on.
fn dofSpread(cocRadius: f32, distance: f32, feather: f32) -> f32 {
  return saturateF32(cocRadius - distance + feather);
}

// FidelityFX's rangeThreshNear, which is what keeps a tap sharp enough to be no
// part of the near field out of it: at half a pixel a tap only contributes once
// its own disc reaches past the gap to this one. Their rangeThreshFill and
// rangeThreshFar add ringGap on top, which is zero in everything they ship.
const DOF_NEAR_FEATHER: f32 = 0.5;

// A pixel, where FidelityFX feathers the far field not at all — and that is
// forced by the clamp, not a loosening of it.
//
// A tap's far radius is clamped to this pixel's own, and the span the rings are
// laid over is that same value, so no tap can ever exceed the outermost ring's
// distance. FidelityFX has no such clamp: their span is the tile's, a tap may
// be more defocused than it, and the outermost ring earns its samples. Take
// their zero feather here and that ring accepts nothing at all — the far field
// then loses its outer ring everywhere, not only near an edge.
const DOF_FAR_FEATHER: f32 = 1.0;

// The width of the band a sample projects to on the aperture, normalised to the
// span and to the kernel's ring spacing.
//
// A sample with a small circle of confusion stands for a wide band, because
// little of the aperture had to be open for it to arrive sharp; one at the span
// stands for a single ring's width. This is what gives a bucket a thickness, so
// two of them can be tested for overlap rather than compared as bare numbers.
fn dofCoverage(coc: f32, span: f32, ringCount: f32) -> f32 {
  return saturateF32((0.5 / ringCount) * (span / max(coc, 1e-4) + 1.0));
}

// One layer of the far field: what it carries, how wide a band of the aperture
// it came through, and where that band sits.
struct DoFBucket {
  // rgb premultiplied by weight, a the weight.
  color: vec4f,
  // Summed per-sample coverage; divided by count it is the band's half-width.
  covg: f32,
  // Normalised radius of the band's centre.
  radius: f32,
  count: f32,
}

// Merge a ring into what is already accumulated, the nearer one hiding part of
// the further.
//
// The occlusion is the area the two bands share over the area of the
// accumulated one — two annuli on the aperture, so a ring only hides what it
// actually covers. A bare comparison of radii cannot express that: a background
// receding smoothly across the gather spans several pixels of defocus without
// being two surfaces, and any test on the difference alone erases it.
//
// The opacity is the share of the ring's samples that formed this layer, so a
// ring that only partly hit something near occludes only partly.
fn dofMergeBuckets(prev: DoFBucket, curr: DoFBucket, opacity: f32) -> DoFBucket {
  let prevRC = saturateF32(prev.covg / max(prev.count, 1.0));
  let currRC = saturateF32(curr.covg / max(curr.count, 1.0));

  let prevOuter = saturateF32(prev.radius + prevRC);
  let prevInner = prev.radius - prevRC;
  let currOuter = saturateF32(curr.radius + currRC);
  let currInner = curr.radius - currRC;

  let insOuter = min(prevOuter, currOuter);
  let insInner = max(prevInner, currInner);

  // Signed so a band straddling the centre is measured as a disc, not folded.
  let prevArea = prevOuter * prevOuter - sign(prevInner) * prevInner * prevInner;

  var occlusion = 0.0;
  if (insOuter >= insInner && prevArea > 1e-6) {
    occlusion = saturateF32(
      (insOuter * insOuter - sign(insInner) * insInner * insInner) / prevArea
    );
  }

  let factor = 1.0 - opacity * occlusion;

  let outer = max(prevOuter, currOuter);
  let inner = min(prevInner, currInner);

  var merged: DoFBucket;
  merged.color = prev.color * factor + curr.color;
  // The band that roughly covers both, so the next ring is tested against the
  // whole of what survived rather than against the last ring alone.
  merged.radius = 0.5 * (outer + inner);
  merged.count = prev.count * factor + curr.count;
  merged.covg = merged.count * 0.5 * (outer - inner);
  return merged;
}

// How much of a source's disc arrives at any one destination inside it.
//
// A defocused pixel spreads its radiance over pi*r^2, so what reaches a given
// destination falls as the inverse of that area. Uniform weights instead let a
// strongly defocused foreground deliver as much per pixel as a barely defocused
// one, which spreads a near field over the width of the tile rather than of its
// own disc.
//
// Saturating below about half a pixel of radius, where the disc is contained in
// its own texel and scatters onto nothing.
fn dofScatter(cocRadius: f32) -> f32 {
  return saturateF32(1.0 / max(PI * cocRadius * cocRadius, 1e-4));
}

// One ring per pixel of radius, capped, and the level whose texels cover the
// spacing that leaves between taps.
//
// The ring scale widens the cap where the tile holds a range of radii rather than
// one. The normalisation that makes coverage independent of the tile is exact
// only in the continuum: with a kernel spanning several times the local radius,
// only the innermost rings fall inside it and their discreteness swamps the
// cancellation, so coverage at a silhouette starts to follow the tile grid
// instead of the surface. Spending the extra rings only where the range is wide
// keeps that cheap.
//
// Samples sit on evenly spaced concentric rings, ring i carrying i *
// DOF_SAMPLES of them at i / rings of the radius. A sample count rising with
// the circumference makes the density uniform per unit area, so every tap has
// the same radial gap and the same arc from its neighbours and one level
// describes all of them. Per-ring levels would give a bright point to the inner
// rings sharp and to the outer ones blurred, counting its energy several times
// over and leaving a hot core.
//
// The level is rounded up, and both halves of the footprint are load bearing.
//
// A tap covers one texel of its level and they sit a footprint apart, so the
// level has to be at least as coarse as that spacing or the taps step over
// texels nobody reads: a bright point then reaches some of them and not others,
// and its disc comes out as separated dots rather than solid.
//
// FidelityFX truncates instead, and pays for the gap elsewhere — ringGap
// widens their acceptance test by exactly the pixels the kernel skips. Rounding
// up buys the same coverage without a feather that over-covers wherever the cap
// binds hard. Taking their rounding without their ringGap is the one
// combination that does not work: measured on a defocused highlight, the disc's
// interior goes from a few percent of variation to forty.
//
// The arc term is not redundant with the radial one either. It exceeds it by
// 2*pi/samples, so dropping it rounds to the same level at most radii but one
// level short wherever the radial spacing lands on a power of two — and those
// are the radii that then dot.
fn dofKernel(radius: f32, ringScale: f32, ringCap: i32) -> DoFKernel {
  var kernel: DoFKernel;

  let cap = max(i32(ceil(f32(ringCap) * ringScale)), 1);
  kernel.rings = min(max(i32(ceil(radius)), 1), cap);
  kernel.ringCount = f32(kernel.rings);

  let footprint = max(
    radius / kernel.ringCount,
    TWO_PI * radius / (kernel.ringCount * f32(DOF_SAMPLES))
  );
  kernel.lod = min(ceil(log2(max(footprint, 1.0))), DOF_MAX_MIP);

  return kernel;
}

// The two fields, each over its own span.
//
// A near field spans the tile's near extent, because a foreground scatters in
// from wherever it is and only the neighbourhood knows how far to look. A far
// field spans this pixel's own defocus, because nothing beyond that survives
// the occlusion below and rings placed out there sample a guaranteed-empty
// annulus.
//
// Those are different numbers, and one kernel cannot serve both. Taking the
// larger spreads the other field's rings over a radius it never needed: a
// foreground sharper than the background behind it then gets two rings across
// its whole disc, and its coverage falls off in plateaus one ring apart — a
// stepped outline rather than a silhouette. So each field derives its own ring
// count, spacing and level, and a pixel where only one field is live runs only
// that loop.
// Colour and radius come from the same texture through different samplers, and
// that is not an optimisation to undo. A tap's weight is an inverse disc area,
// which is singular for a small radius, so a radius interpolated across a
// silhouette — a value between a foreground's and the background's, belonging
// to neither — is handed orders of magnitude more influence than the real
// foreground beside it. Point sampling keeps every radius one a texel actually
// holds, which is also why each level of the chain stores a texel's radius
// rather than an average of four.
//
// Colour stays filtered. Point sampling it too would save a fetch and draw a
// bright texel of a coarse level as a hard square the width of that texel.
fn dofGather(
  tex: texture_2d<f32>,
  texSampler: sampler,
  cocTex: texture_2d<f32>,
  cocSampler: sampler,
  texCoord: vec2f,
  fragCoord: vec2f,
  tile: vec4f,
  params: DepthOfFieldParams
) -> DoFFields {
  let centerColor = textureSampleLevel(tex, texSampler, texCoord, 0.0).rgb;
  let centerCoC = textureSampleLevel(cocTex, cocSampler, texCoord, 0.0).a;

  // How far anything behind this pixel may bleed over it: this pixel's own
  // defocus, not the source's. A surface is an occluder — the background disc
  // overlapping it in image space is blocked by it, and what is left is the
  // softness of the occluder's own edge. Without it a sky at the radius cap
  // reaches the full tile radius onto a barely defocused floor.
  //
  // The far field only. A foreground does scatter over what is behind it, so
  // the near field tests the tap's own radius and carries visibility in its
  // coverage — the asymmetry Unity's post-processing stack draws between its
  // bgCoC and fgWeight.
  let centerFar = max(-centerCoC, 0.0);

  let centerNear = max(centerCoC, 0.0);

  var fields: DoFFields;
  // Alpha says whether this holds anything, not coverage. A pixel with no far
  // content and no foreground over it contributes nothing and the composite
  // keeps the sharp image.
  fields.far = vec4f(centerColor, 0.0);
  fields.near = vec4f(0.0);

  // What is behind this pixel, for a pixel that is itself foreground.
  //
  // A defocused foreground is semi-transparent at its edges, so something has
  // to show through — and the sharp image cannot supply it, because at these
  // pixels the sharp image *is* the foreground. Without this the near field
  // composites over a copy of itself and the object reads as a solid silhouette
  // however soft its edge is.
  //
  // It goes in the far field because the two are mutually exclusive: a pixel in
  // front of the focal plane has no far content of its own, and one behind it
  // needs no fill.
  //
  // Seeded with however much of this pixel is not foreground, so a nearly sharp
  // pixel stands in for its own background.
  let fillPart = 1.0 - saturateF32(centerNear);
  var fill = vec4f(centerColor * fillPart, fillPart);

  let phase = dofDither(fragCoord) * TWO_PI;

  // How much of one surface this tile describes. One radius throughout and the
  // kernel matches what it samples; a wide range and the rings are spread over
  // content most of them cannot see.
  let tileMax = max(tile.x, tile.y);
  let ringScale = select(
    mix(DOF_RING_SCALE, 1.0, saturateF32(dofTileMinRadius(tile) / max(tileMax, 1e-4))),
    1.0,
    dofTileEmpty(tile)
  );

  let farSpan = min(tile.y, centerFar);
  if (farSpan >= 0.5) {
    let kernel = dofKernel(farSpan, ringScale, DOF_FAR_RINGS);

    // What has survived so far. Rings run outwards in, because that ordering
    // approximates a depth ordering: a sample far enough out to still reach the
    // centre must have a large circle of confusion, and in the far field a
    // larger one means further away.
    var accum: DoFBucket;
    accum.color = vec4f(0.0);
    accum.covg = 0.0;
    accum.radius = 0.0;
    accum.count = 0.0;

    for (var ring = kernel.rings; ring >= 1; ring--) {
      let count = ring * DOF_SAMPLES;
      let angleStep = TWO_PI / f32(count);

      let t = f32(ring) / kernel.ringCount;
      let ringRadius = farSpan * t;

      // Rings whose sample counts share a divisor put their samples on the same
      // spokes, and the disc then reads as a star.
      let ringPhase = phase + f32(ring) * DOF_GOLDEN_ANGLE;

      // A sample this much further back than the ring is not an occluder at
      // all, it is more of the background — so it joins what is accumulated
      // instead of forming the layer that hides it. Without the split a ring
      // occludes with its own background in it, and a surface receding across
      // the gather eats itself.
      let bucketBorder = (f32(ring) + 1.5) * farSpan / (0.5 + kernel.ringCount);

      // Weighted sum of the bucket's radii, for the mean below.
      var bucketCoC = 0.0;

      var bucket: DoFBucket;
      bucket.color = vec4f(0.0);
      bucket.covg = 0.0;
      bucket.radius = t;
      bucket.count = 0.0;

      for (var i = 0; i < count; i++) {
        let angle = ringPhase + f32(i) * angleStep;
        // The aperture's shape decides where the sample sits and how much area
        // it stands for: placing samples on the polygon scales the area element
        // by the square of its radius in that direction. One for a round
        // aperture, which is the default.
        let shape = dofBladeRadius(angle, params);
        let distance = ringRadius * shape;
        let offset = vec2f(cos(angle), sin(angle)) * distance;
        let weight = shape * shape;

        let uv = texCoord + offset * params.halfTexelSize;
        let tapColor = textureSampleLevel(tex, texSampler, uv, kernel.lod).rgb;
        // Level 0, where the colour above takes the kernel's level.
        //
        // The references split here: FidelityFX reads both from one fetch at
        // the chosen mip, and so does HDRP's classic far pass, while HDRP's
        // physically based path loads the radius full resolution, through a
        // GetCoCRadius that takes no mip parameter at all, while its colour is
        // sampled trilinear. This follows the latter, for the reason the near
        // loop already does: the radius decides acceptance and which bucket a
        // tap lands in, both of them hard thresholds, so reading it from a
        // level that states one radius per 2^N pixels quantises the silhouette
        // to that grid. FidelityFX can afford the cheaper form because their
        // cap does not bind in anything they ship, so their level is zero.
        let tapCoC = textureSampleLevel(cocTex, cocSampler, uv, 0.0).a;

        // A tap's own disc is the aperture's shape too, and the direction that
        // decides whether it reaches this pixel is the one from the tap back to
        // here. Shaping only the placement would leave the acceptance test
        // circular, so the bokeh's shape would depend on what else sits nearby.
        let reach = dofBladeRadius(angle + PI, params);

        let tapFar = min(max(-tapCoC, 0.0), centerFar);
        let w = dofSpread(tapFar * reach, distance, DOF_FAR_FEATHER)
          * dofScatter(tapFar) * weight;
        // On the tap's own magnitude, unclamped and either side of the focal
        // plane, where the weight above is clamped against this pixel.
        //
        // The clamp belongs to the weight: it says how far behind this pixel
        // something may bleed, which is a fact about the pair. Where a tap sits
        // on the aperture is a fact about the tap alone, so measuring it
        // against the destination's defocus makes the band geometry — and the
        // occlusion derived from it — vary from pixel to pixel across a
        // silhouette. Worse, a foreground tap clamps to zero, whose projection
        // is the whole aperture: the geometry in front then occludes the
        // background behind it at full width while contributing no colour,
        // which draws a one pixel rim of unblurred background along every
        // silhouette.
        let covg = dofCoverage(abs(tapCoC), farSpan, kernel.ringCount);

        // Unclamped for the same reason: against a border derived from the
        // span, a value clamped to the span can only reach the outermost ring's
        // border by equalling it, so every tap falls into the occluding bucket
        // there whatever its depth.
        if (-tapCoC >= bucketBorder) {
          accum.color += vec4f(tapColor * w, w);
          accum.covg += covg;
          accum.count += 1.0;
        } else {
          bucket.color += vec4f(tapColor * w, w);
          bucket.covg += covg;
          bucket.count += 1.0;
          bucketCoC += tapFar * w;
        }
      }

      // How much of the ring this layer actually fills, by weight rather than
      // by sample count: what the bucket carries over what a full ring of taps
      // at the bucket's own radius would carry. HDRP's ringOpacity.
      //
      // The count is the wrong measure because a tap lands in this bucket on
      // its radius alone, before anything asks whether it reaches here. Taps
      // that do not — an in-focus surface, or a background too close to the
      // focal plane to span the distance — carry no colour, and their absence
      // is already in the normalisation. Counting them occludes a second time
      // for the same surface, which rims a sharp silhouette with a band as wide
      // as the gather and the wrong brightness on each side of it.
      var occluding = 0.0;
      if (USE_DOF_RING_OCCLUSION && bucket.color.a > 0.0) {
        let normCoC = bucketCoC / bucket.color.a;
        occluding = saturateF32(
          bucket.color.a / max(dofScatter(normCoC) * f32(count), 1e-12)
        );
      }

      // A bucket carrying nothing has no band either: its radii would describe
      // an annulus for content that is not there, and the next ring would be
      // tested against it. HDRP returns early on the same condition.
      if (bucket.color.a > 0.0) {
        accum = dofMergeBuckets(accum, bucket, occluding);
      }
    }

    // The centre merges last and at full opacity: it is the nearest thing there
    // is, and nothing in the kernel can be in front of it.
    var center: DoFBucket;
    let centerWeight = dofScatter(centerFar);
    center.color = vec4f(centerColor * centerWeight, centerWeight);
    center.covg = dofCoverage(centerFar, farSpan, kernel.ringCount);
    center.radius = 0.0;
    center.count = 1.0;

    accum = dofMergeBuckets(accum, center, 1.0);

    // No coverage of its own: what decides whether a pixel takes this is that
    // pixel's own defocus. The alpha only says the field has content here.
    fields.far = vec4f(accum.color.rgb / max(accum.color.a, 1e-4), 1.0);
  }

  let nearSpan = tile.x;
  if (nearSpan >= 0.5) {
    let kernel = dofKernel(nearSpan, ringScale, DOF_NEAR_RINGS);

    // The centre, standing for everything inside the innermost ring rather than
    // for one tap. With one ring per pixel that region is sub-pixel and the two
    // agree; once the cap binds the spacing exceeds a pixel and a plain tap
    // leaves a hole at the middle of every disc. FidelityFX's nearCenterWeight,
    // less the mip's own footprint, which the rings already cover.
    let innerRadius = max(1.0, nearSpan / kernel.ringCount - exp2(kernel.lod));
    // How much of this pixel is foreground at all. The rest of it is background
    // and goes to the fill below, on the same split. This is the only thing
    // keeping a sharp centre out of the near field: every other tap is gated by
    // its distance, and the centre has none.
    let nearPart = saturateF32(centerNear);
    let centerNearWeight =
      dofScatter(centerNear) * innerRadius * innerRadius * nearPart;

    var nearColor = centerColor * centerNearWeight;
    var nearWeight = centerNearWeight;
    // The area this kernel spends on the near field, which the coverage below
    // turns into a fraction. Aperture weights only — the scatter weight belongs
    // to the tap, and the span's stands in for it there. Rings only: the centre
    // is what covers the area they leave, so counting it here would subtract
    // the hole it is there to fill.
    var nearArea = 0.0;

    for (var ring = kernel.rings; ring >= 1; ring--) {
      let count = ring * DOF_SAMPLES;
      let angleStep = TWO_PI / f32(count);
      let t = f32(ring) / kernel.ringCount;
      let ringRadius = nearSpan * t;
      let ringPhase = phase + f32(ring) * DOF_GOLDEN_ANGLE;

      for (var i = 0; i < count; i++) {
        let angle = ringPhase + f32(i) * angleStep;
        let shape = dofBladeRadius(angle, params);
        let distance = ringRadius * shape;
        let offset = vec2f(cos(angle), sin(angle)) * distance;
        let weight = shape * shape;

        let uv = texCoord + offset * params.halfTexelSize;
        let tapColor = textureSampleLevel(tex, texSampler, uv, kernel.lod).rgb;
        // Level 0, like the far loop's. Coverage is a question about a
        // silhouette and a coarse level cannot describe one: a level N texel
        // states a single radius across 2^N pixels, and since this weight goes
        // as 1/r^2 one texel holding an unrepresentative small radius outweighs
        // every correct tap around it and paints its whole footprint as a flat
        // block.
        let tapCoC = textureSampleLevel(cocTex, cocSampler, uv, 0.0).a;

        let reach = dofBladeRadius(angle + PI, params);

        let tapNear = max(tapCoC, 0.0);
        let near = dofSpread(tapNear * reach, distance, DOF_NEAR_FEATHER)
          * dofScatter(tapNear)
          * weight;
        nearColor += tapColor * near;
        nearWeight += near;
        nearArea += weight;

        // This pixel's own contribution to the fill is the seed above; it also
        // has no distance to fall off with.
        if (centerNear > 0.0) {
          // Reject taps on this same foreground, on a slope of one pixel of
          // radius per pixel of distance — what is behind an object is what is
          // less near than it, by more the further out we look. Rejected rather
          // than excluded: a pixel with nothing better behind it should still
          // show something, so they stay at a negligible weight.
          let behind = tapCoC < centerNear - distance;
          let accept = select(1.0 / 2048.0, 1.0, behind);
          // Nearest first. What is adjacent in the image is the better guess at
          // what this pixel hides, and the disc area a tap stands for grows as
          // the square of how far out it sits.
          //
          // On the tap's own magnitude, either side of the focal plane: a
          // defocused background delivers proportionally less of itself here
          // than a sharp one, exactly as it does to the fields.
          let fillWeight = dofScatter(abs(tapCoC))
            * weight * accept / (distance * distance);

          fill += vec4f(tapColor * fillWeight, fillWeight);
        }
      }
    }

    // The near field is foreground over an unknown background, so it is an
    // image with coverage — premultiplied, so the post filter's blur and the
    // composite's bilinear read stay correct where that coverage is partial.
    //
    // Normalised against what this kernel would carry if every tap were a
    // foreground at the span's own radius, which is what makes the fraction a
    // coverage rather than the local disc's area over the span's. Those differ
    // by (coc / span)^2, and the span is a dilated neighbourhood maximum: a
    // floor receding towards the camera would then read as barely covered
    // anywhere its own defocus fell short of the nearest thing in the frame, in
    // steps following the tile grid. The inverse-area weights cancel that
    // ratio, so the answer stops depending on what else the tile happens to
    // hold.
    //
    // Ramped rather than taken as it is. A gather's coverage falls away across
    // the whole disc, and laying that over the image linearly washes foreground
    // colour over everything within reach.
    let coverage = smoothstep(
      0.0,
      1.0,
      saturateF32(nearWeight / max(dofScatter(nearSpan) * nearArea, 1e-4))
    );
    fields.near = vec4f(nearColor / max(nearWeight, 1e-4) * coverage, coverage);
  }

  // Mutually exclusive with the far accumulation above, which only runs for a
  // pixel behind the focal plane.
  if (centerNear > 0.0 && fill.a > 0.0) {
    fields.far = vec4f(fill.rgb / fill.a, 1.0);
  }

  return fields;
}
`;

/**
 * The near field's post filter: a median that rejects the speckle a dithered
 * gather leaves along a silhouette. Requires `luma`.
 *
 * @member {string}
 */
const postFilter = /* wgsl */ `
// Below this a texel carries no foreground worth speaking of, and its colour
// cannot be recovered from a premultiplied one.
const DOF_MIN_COVERAGE: f32 = 0.01;

fn dofMedian3(a: f32, b: f32, c: f32) -> f32 {
  return max(min(a, b), min(max(a, b), c));
}

// Median of nine, as medians of medians: the largest of the three minima, the
// median of the three medians, the smallest of the three maxima, and the median
// of those. Exact, and branch-free — verified against a true median on random
// neighbourhoods. FidelityFX writes it as FfxMed9.
fn dofMedian9(v: array<f32, 9>) -> f32 {
  let lo = max(
    max(min(min(v[0], v[1]), v[2]), min(min(v[3], v[4]), v[5])),
    min(min(v[6], v[7]), v[8])
  );
  let mid = dofMedian3(
    dofMedian3(v[0], v[1], v[2]),
    dofMedian3(v[3], v[4], v[5]),
    dofMedian3(v[6], v[7], v[8])
  );
  let hi = min(
    min(max(max(v[0], v[1]), v[2]), max(max(v[3], v[4]), v[5])),
    max(max(v[6], v[7]), v[8])
  );

  return dofMedian3(lo, mid, hi);
}

// One near-field texel, despeckled.
//
// The gather's ring phase is per pixel and screen-static — depth of field runs
// after the temporal resolve, so a phase that moved per frame would be noise
// nothing averages away — and where few taps land on a foreground, which two of
// them land decides the coverage. That reads as a fixed stipple along every
// silhouette, and averaging spreads a bright speck into a soft blob instead of
// removing it.
//
// So the colour is not averaged. The centre texel is kept and rescaled towards
// the luminance its neighbourhood agrees on: a lone speck is divided down by
// however far it stands out, a texel already in agreement is multiplied by one
// and keeps its detail. Bounded at two, so the filter can lift a lone dark
// texel without inventing a highlight. FidelityFX's FfxDofFilterNF.
//
// Luminance is compared on unpremultiplied colour. The stipple is in the
// coverage as much as in the colour, so premultiplied luma would measure how
// covered a texel is rather than how bright, and the rescale would drag the
// partly covered edge of a silhouette towards the interior's luminance —
// raising colour without raising coverage, which reads as a bright fringe.
//
// A neighbourhood that is mostly empty has a zero median, and then the rescale
// is skipped rather than collapsing the one covered texel in it.
fn dofFilterNear(tex: texture_2d<f32>, texSampler: sampler, texCoord: vec2f, texelSize: vec2f) -> vec4f {
  var lumas = array<f32, 9>();
  var premultiplied = vec3f(0.0);
  var coverage = 0.0;
  var center = vec4f(0.0);

  for (var i = 0; i < 9; i++) {
    let offset = vec2f(f32(i % 3) - 1.0, f32(i / 3) - 1.0) * texelSize;
    let tap = textureSampleLevel(tex, texSampler, texCoord + offset, 0.0);

    lumas[i] = luma(tap.rgb / max(tap.a, DOF_MIN_COVERAGE));
    premultiplied += tap.rgb;
    coverage += tap.a;

    if (i == 4) {
      center = tap;
    }
  }

  // Coverage is averaged over the nine, which is where the spatial smoothing
  // went, and is what a premultiplied image expects.
  //
  // That average can be non-zero over a centre texel that holds none, and a
  // premultiplied texel with no coverage has no colour either — keeping it
  // would paint a dark seam one texel wide around the whole near field. The
  // neighbourhood's coverage-weighted mean is the colour that seam should
  // carry, which is the sum of the premultiplied taps over the coverage that
  // premultiplied them. FidelityFX borrows the brightest corner instead; this
  // needs no such choice, because a premultiplied sum already weights every
  // neighbour by how much foreground it holds.
  let covered = center.a > DOF_MIN_COVERAGE;
  let color = select(
    premultiplied / max(coverage, DOF_MIN_COVERAGE),
    center.rgb / center.a,
    covered
  );

  let median = dofMedian9(lumas);
  let gain = select(
    1.0,
    clamp(median / lumas[4], 0.0, 2.0),
    covered && median > 0.0 && lumas[4] > 0.0
  );

  coverage /= 9.0;

  return vec4f(color * gain * coverage, coverage);
}
`;

/**
 * The two fields over the sharp image, at full resolution, and the debug view.
 * Requires {@link common} and `math.saturate`.
 *
 * @member {string}
 */
const composite = /* wgsl */ `
override USE_DOF_CHROMATIC_ABERRATION: bool = false;

override USE_DOF_TRANSITION_BLUR: bool = true;

// Four bilinear taps at a corner offset of half the radius on each axis, so
// they sit at radius/sqrt(2) from the centre — the root-mean-square radius of a
// uniform disc, which is the single ring that best stands in for one.
fn dofTransitionBlur(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  radius: f32,
  params: DepthOfFieldParams
) -> vec3f {
  let o = params.texelSize * radius * 0.5;

  return 0.25 * (
    textureSampleLevel(tex, texSampler, texCoord + vec2f(-o.x, -o.y), 0.0).rgb
    + textureSampleLevel(tex, texSampler, texCoord + vec2f(o.x, -o.y), 0.0).rgb
    + textureSampleLevel(tex, texSampler, texCoord + vec2f(-o.x, o.y), 0.0).rgb
    + textureSampleLevel(tex, texSampler, texCoord + vec2f(o.x, o.y), 0.0).rgb
  );
}

// One field, with the lens' colour fringing. Displacing each channel before the
// gather and after it are the same convolution — a blur is shift invariant — so
// this costs three taps per field rather than three per tap.
//
// Only the fringing that scales with the circle of confusion belongs here. The
// lateral kind scales with distance from the optical centre instead, and
// belongs with distortion and vignetting, after the tone map.
// Three displaced reads, kept as three. The near field is premultiplied, so
// each channel arrives carrying the coverage of the tap it came from; averaging
// those into one alpha would leave colour describing a coverage the alpha does
// not, and a channel can then exceed its own coverage — which composites as a
// bright fringe along the edge of every near bokeh, exactly where the effect is
// meant to be seen. Carried as a vec3 coverage instead, so the composite lays
// each channel over the coverage that produced it.
struct DoFField {
  color: vec3f,
  coverage: vec3f,
}

fn dofSampleField(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  fringe: vec2f
) -> DoFField {
  var field: DoFField;

  if (!USE_DOF_CHROMATIC_ABERRATION) {
    let tap = textureSampleLevel(tex, texSampler, texCoord, 0.0);
    field.color = tap.rgb;
    field.coverage = vec3f(tap.a);
    return field;
  }

  let r = textureSampleLevel(tex, texSampler, texCoord + vec2f(0.0, 1.0) * fringe, 0.0);
  let g = textureSampleLevel(tex, texSampler, texCoord + vec2f(-0.866, -0.5) * fringe, 0.0);
  let b = textureSampleLevel(tex, texSampler, texCoord + vec2f(0.866, -0.5) * fringe, 0.0);

  field.color = vec3f(r.r, g.g, b.b);
  field.coverage = vec3f(r.a, g.a, b.a);
  return field;
}

// The sharp image, its own small blur, the gathered field, then the near field
// over all three.
//
// The transition blur exists because between about one and three pixels of
// radius the half-resolution gather is too coarse to describe the blur, and
// switching straight to it pops as content crosses that width.
//
// The field is taken on the magnitude of the circle of confusion rather than on
// its sign, because for a pixel in front of the focal plane it carries the
// background reconstructed behind that foreground. Gating on the sign instead
// leaves a defocused foreground compositing over a copy of itself, which reads
// as a solid silhouette no matter how soft its edge.
fn dofComposite(
  tex: texture_2d<f32>,
  texSampler: sampler,
  farTex: texture_2d<f32>,
  farSampler: sampler,
  nearTex: texture_2d<f32>,
  nearSampler: sampler,
  texCoord: vec2f,
  coc: f32,
  params: DepthOfFieldParams
) -> vec4f {
  let color = textureSampleLevel(tex, texSampler, texCoord, 0.0);

  // Full-resolution pixels: the gather is measured in its own grid, and what
  // follows chooses between that grid and this one.
  let radius = abs(coc) * 2.0;
  let fringe = params.halfTexelSize * params.chromaticAberration * abs(coc);

  // Two handovers over the first pixels of defocus, so nothing arrives at once:
  // the sharp image gives way to its own small blur, and that to the gathered
  // field once there is a disc wide enough for a half-resolution gather to
  // describe.
  let toTransition = saturateF32(radius - 0.5);
  let toField = saturateF32(radius - 1.5);

  var result = color.rgb;
  if (USE_DOF_TRANSITION_BLUR) {
    result = mix(
      result,
      dofTransitionBlur(tex, texSampler, texCoord, min(radius, 3.0), params),
      toTransition
    );
  }

  // On the magnitude, so a pixel in front of the focal plane takes this too —
  // there it holds the background reconstructed behind the foreground rather
  // than a far field, and the near field below is what goes over it. A sharp
  // pixel takes neither and stays sharp to its edge.
  //
  // Scaled by whether the field has anything here, so a pixel the gather left
  // empty keeps the image rather than fading towards an unwritten texel.
  let far = dofSampleField(farTex, farSampler, texCoord, fringe);
  // Whether the field holds anything here is a fact about the frame rather than
  // part of the image, so it is read undisplaced. Carried through the fringe it
  // lets one channel take the field where another does not, and the boundary it
  // straddles runs along every silhouette — which shows as a trail of
  // single-channel specks following the outline.
  var farContent = far.coverage.r;
  if (USE_DOF_CHROMATIC_ABERRATION) {
    farContent = textureSampleLevel(farTex, farSampler, texCoord, 0.0).a;
  }

  result = mix(result, far.color, toField * farContent);

  // Premultiplied, so this is "over" and not a mix, and per channel so the
  // fringe stays consistent with the coverage that produced it.
  let near = dofSampleField(nearTex, nearSampler, texCoord, fringe);
  result = result * (1.0 - near.coverage) + near.color;

  // The chain carries alpha through for a canvas configured with a transparent
  // background, and nothing here has an opinion about coverage.
  return vec4f(result, color.a);
}

// Near field red, far field blue, saturating at the radius cap, with the focal
// plane where both go black. Green is the tile's dilated radius: what the
// gather spent its samples on, which the composited image cannot show.
fn dofDebug(coc: f32, tile: vec2f, params: DepthOfFieldParams) -> vec3f {
  let scale = 1.0 / max(params.maxCoCRadius, 1e-4);

  return vec3f(
    max(coc, 0.0) * scale,
    max(tile.x, tile.y) * scale * 0.25,
    max(-coc, 0.0) * scale
  );
}
`;

export {
  common,
  depth,
  coc,
  focus,
  resolve,
  downsample,
  prefilter,
  tiles,
  gather,
  postFilter,
  composite,
};
