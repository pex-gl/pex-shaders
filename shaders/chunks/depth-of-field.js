/**
 * Depth of Field
 *
 * Tile-based scatter-as-gather at half resolution, near and far fields
 * separated: prefilter colour and circle of confusion together, reduce the
 * circle of confusion to a coarse grid, gather both fields from one set of
 * taps, composite back at full resolution.
 *
 * The arrangement production depth of field converged on — Jimenez, "Next
 * Generation Post Processing in Call of Duty: Advanced Warfare" (SIGGRAPH
 * 2014), Unity's HDRP, AMD's FidelityFX Depth of Field. The reasons are
 * structural rather than about cost:
 *
 * - **Scatter as gather.** Testing per tap whether *that tap's* disc reaches
 *   here means an in-focus pixel has no disc and cannot leak onto a defocused
 *   neighbour, and normalising by the weights that did reach reconstructs the
 *   background behind a foreground object.
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
 * Requires `math.PI`, `math.TWO_PI`, `math.saturate`, `luma`, `threshold` and
 * `depthRead`.
 *
 * @type {string}
 * @alias module:chunks.depthOfField
 */
export default /* wgsl */ `
struct DepthOfFieldParams {
  // Full-resolution viewport and grid.
  viewportSize: vec2f,
  texelSize: vec2f,
  // The grid every pass but the composite rasterizes into.
  halfTexelSize: vec2f,
  // Where autofocus reads, in UV.
  screenPoint: vec2f,
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
  // Depth of the in-focus zone around focusDistance, in mm.
  focusRange: f32,
  // Ramp exponent outside that zone. 1 is linear, above holds focus longer then
  // blurs faster, below leaves the zone immediately.
  focusFalloff: f32,

  // Cap, in half-resolution pixels.
  maxCoCRadius: f32,
  // Per-channel displacement of the bokeh, as a fraction of its radius.
  chromaticAberration: f32,
  // Applied to luma before the threshold, so it lands in the same
  // image-referred units bloom's does and neither retargets with exposure.
  exposure: f32,
  luminanceThreshold: f32,
  luminanceGain: f32,
  luminanceKnee: f32,
  // Diaphragm blades. Under three there is no polygon and the aperture is round.
  blades: f32,
  bladeRotation: f32,
  bladeCurvature: f32,
}

override DOF_RINGS: i32 = 3;
override DOF_SAMPLES: i32 = 6;
override DOF_TILE_SIZE: i32 = 8;
override DOF_TILE_DILATE_RADIUS: i32 = 4;
override USE_DOF_PHYSICAL: bool = true;
override USE_DOF_RING_OCCLUSION: bool = true;
override USE_DOF_CHROMATIC_ABERRATION: bool = false;
override USE_DOF_TRANSITION_BLUR: bool = true;
// Levels the prefilter actually has, past which there is nothing to read.
override DOF_MAX_MIP: f32 = 4.0;

// Circle of confusion

fn dofDepth(
  depthTex: texture_depth_2d,
  depthSampler: sampler,
  uv: vec2f,
  params: DepthOfFieldParams
) -> f32 {
  // m -> mm
  return readDepth(depthTex, depthSampler, uv, params.near, params.far) * 1000.0;
}

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

// Temporal resolve of the circle of confusion

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

// Prefilter

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
// one's disc. Keeping the largest radius drops the sharp surface out of the
// coarse levels instead, which is correct: it has no disc to spread, and the
// fine levels a small radius reads still hold it exactly.
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
  var reference = 0.0;

  for (var i = 0; i < 4; i++) {
    taps[i] = textureSampleLevel(tex, texSampler, texCoord + offsets[i] * texelSize, 0.0);

    if (abs(taps[i].a) > abs(reference)) {
      reference = taps[i].a;
    }
  }

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
// Bilateral, keyed on the circle of confusion rather than on depth. The block
// is about to become whichever of its four texels spreads furthest, so that one
// is the reference — averaging a sharp foreground into a defocused background
// is what makes a silhouette leak.
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
  var reference = 0.0;

  for (var i = 0; i < 4; i++) {
    let uv = texCoord + dofQuadOffset(i) * params.texelSize;
    colors[i] = textureSampleLevel(tex, texSampler, uv, 0.0).rgb;

    if (abs(cocs[i]) > abs(reference)) {
      reference = cocs[i];
    }
  }

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
    luma(color) * params.exposure,
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

// Tiles

// The two fields spread in opposite directions, so a tile carries the extent of
// each as a positive magnitude: x near, y far.
fn dofTileCoC(coc: f32) -> vec2f {
  return vec2f(max(coc, 0.0), max(-coc, 0.0));
}

// Gather

struct DoFFields {
  far: vec4f,
  near: vec4f,
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
// a pixel of feather so a disc grows in rather than switching on.
fn dofSpread(cocRadius: f32, distance: f32) -> f32 {
  return saturateF32(cocRadius - distance + 1.0);
}

// Both fields from one set of taps: the taps are what this costs, and each
// field's test is a comparison in pixels that does not care which radius the
// loop ran to.
//
// Samples sit on evenly spaced concentric rings, ring i carrying i *
// DOF_SAMPLES of them at i / DOF_RINGS of the radius. A sample count rising
// with the circumference makes the density uniform per unit area, so the plain
// sum is a disc integral and the near field's coverage an area fraction. It is
// also what lets one mip level serve every ring.
//
// Rings run outwards in and the far field merges them one at a time, because
// that ordering approximates a depth ordering: a sample far enough out to still
// reach the centre must have a large circle of confusion, and in the far field
// a larger one means further away.
fn dofGather(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  fragCoord: vec2f,
  tile: vec2f,
  params: DepthOfFieldParams
) -> DoFFields {
  let center = textureSampleLevel(tex, texSampler, texCoord, 0.0);

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
  let centerFar = max(-center.a, 0.0);

  var fields: DoFFields;
  fields.far = vec4f(center.rgb, 1.0);
  fields.near = vec4f(0.0);

  // What the rings span. The tile's near extent, since a foreground scatters in
  // from wherever it is; but for the far field this pixel's own defocus,
  // because nothing beyond it passes the test above and rings placed out there
  // sample a guaranteed-empty annulus.
  //
  // Spanning the tile's far extent instead puts the tile grid in the image: the
  // rings, and the level derived from them below, step wherever the dilated
  // maximum steps while the blur they describe does not, so a surface at one
  // depth reads as blocks. HDRP writes the same expression with a factor of two
  // on the centre; above one the minimum can select the tile again, which
  // brings the blocks back.
  let radius = max(tile.x, min(tile.y, centerFar));
  if (radius < 0.5) {
    return fields;
  }

  // Colour premultiplied by weight in rgb, weight in a.
  var far = vec4f(0.0);
  // Weighted mean circle of confusion of what is accumulated, which is what the
  // occlusion test compares a ring against.
  var farRadius = 0.0;

  var nearColor = vec3f(0.0);
  var nearWeight = 0.0;
  var nearCount = 0.0;

  let phase = dofDither(fragCoord) * TWO_PI;

  // One level for the whole kernel, not one per ring. Evenly spaced rings
  // carrying samples in proportion to their circumference put every tap the
  // same radial gap and the same arc from its neighbours, so a single footprint
  // describes all of them. Per-ring levels give a bright point to the inner
  // rings sharp and to the outer ones blurred, counting its energy several
  // times over and leaving a hot core.
  let footprint = max(
    radius / f32(DOF_RINGS),
    TWO_PI * radius / f32(DOF_RINGS * DOF_SAMPLES)
  );
  let lod = clamp(log2(max(footprint, 1.0)), 0.0, DOF_MAX_MIP);

  for (var ring = DOF_RINGS; ring >= 0; ring--) {
    // Ring 0 has zero radius and one sample, so it is the centre tap, and it
    // merges last because it is the nearest thing there is.
    let count = max(ring * DOF_SAMPLES, 1);
    let angleStep = TWO_PI / f32(count);

    // Evenly spaced, which makes the tap density uniform per unit area and so
    // the plain sum a disc integral: ring i stands for an annulus whose area
    // grows as i and carries i * DOF_SAMPLES samples to cover it, and the
    // centre's single tap for the small disc inside the first midpoint.
    let t = f32(ring) / f32(DOF_RINGS);
    let ringRadius = radius * t;

    // Rings whose sample counts share a divisor put their samples on the same
    // spokes, and the disc then reads as a star.
    let ringPhase = phase + f32(ring) * DOF_GOLDEN_ANGLE;

    var bucket = vec4f(0.0);
    var bucketRadius = 0.0;
    // The weight this ring would carry if every tap reached, which is what
    // turns the accumulated weight into the fraction of the pixel it covers.
    var bucketArea = 0.0;

    for (var i = 0; i < count; i++) {
      let angle = ringPhase + f32(i) * angleStep;
      // The aperture's shape decides where the sample sits and how much area it
      // stands for: placing samples on the polygon scales the area element by
      // the square of its radius in that direction. One for a round aperture,
      // which is the default.
      let shape = dofBladeRadius(angle, params);
      let distance = ringRadius * shape;
      let offset = vec2f(cos(angle), sin(angle)) * distance;
      let weight = shape * shape;

      // Ring 0 included: a tap standing for less area than its neighbours is
      // not a sharper centre, it is the unblurred image added to the blurred
      // one at 1/count. Invisible on ordinary content and overwhelming on the
      // highlights bokeh exists for — the emitter punches through its own disc.
      let tap = textureSampleLevel(
        tex,
        texSampler,
        texCoord + offset * params.halfTexelSize,
        lod
      );

      // A tap's own disc is the aperture's shape too, and the direction that
      // decides whether it reaches this pixel is the one from the tap back to
      // here. Shaping only the placement would leave the acceptance test
      // circular, so the bokeh's shape would depend on what else sits nearby.
      let reach = dofBladeRadius(angle + PI, params);

      let tapFar = min(max(-tap.a, 0.0), centerFar);
      let w = dofSpread(tapFar * reach, distance) * weight;
      bucket += vec4f(tap.rgb * w, w);
      bucketRadius += tapFar * w;
      bucketArea += weight;

      // Weighted by how defocused the tap is as well as by whether it reaches
      // here: an in-focus pixel is not part of the near field at all, and its
      // disc covering its own texel must not read as coverage.
      let tapNear = max(tap.a, 0.0);
      let near = dofSpread(tapNear * reach, distance) * saturateF32(tapNear) * weight;
      nearColor += tap.rgb * near;
      nearWeight += near;
      // Coverage is an area fraction, so the denominator carries the same area
      // weights the numerator does, and only the taps inside that disc.
      nearCount += weight * step(distance, tile.x + 1.0);
    }

    bucketRadius /= max(bucket.a, 1e-4);

    // Off, this is zero and the merge is the plain weighted sum. On, a ring
    // hides what is behind it only where it is both covering the pixel and
    // nearer than what is accumulated, so a flat background is untouched.
    //
    // Relative, not a difference in pixels: a background receding smoothly
    // across the gather is several pixels of radius wide from edge to centre
    // without being two surfaces, and an absolute test at that width lets the
    // innermost ring erase the whole background.
    var occlusion = 0.0;
    if (USE_DOF_RING_OCCLUSION) {
      occlusion = saturateF32((farRadius - bucketRadius) / max(farRadius, 1.0))
        * (bucket.a / max(bucketArea, 1e-4));
    }

    let survives = 1.0 - occlusion;
    let merged = far.a * survives + bucket.a;
    farRadius = (farRadius * far.a * survives + bucketRadius * bucket.a) / max(merged, 1e-4);
    far = far * survives + bucket;
  }

  // The far field carries no coverage: what decides whether a pixel takes it is
  // that pixel's own defocus, not this one's.
  fields.far = vec4f(far.rgb / max(far.a, 1e-4), 1.0);

  // The near field is foreground over an unknown background, so it is an image
  // with coverage — premultiplied, so the post filter's blur and the
  // composite's bilinear read stay correct where that coverage is partial. Both
  // sides are areas in the same units, so the guard only has to keep the
  // division finite; flooring it at 1 would read a small disc as barely covered.
  let coverage = saturateF32(nearWeight / max(nearCount, 1e-4));
  fields.near = vec4f(nearColor / max(nearWeight, 1e-4) * coverage, coverage);

  return fields;
}

// Composite

// Four bilinear taps half a radius out: the same disc, at the resolution that
// can still see it.
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
fn dofSampleField(
  tex: texture_2d<f32>,
  texSampler: sampler,
  texCoord: vec2f,
  fringe: vec2f
) -> vec4f {
  if (!USE_DOF_CHROMATIC_ABERRATION) {
    return textureSampleLevel(tex, texSampler, texCoord, 0.0);
  }

  let r = textureSampleLevel(tex, texSampler, texCoord + vec2f(0.0, 1.0) * fringe, 0.0);
  let g = textureSampleLevel(tex, texSampler, texCoord + vec2f(-0.866, -0.5) * fringe, 0.0);
  let b = textureSampleLevel(tex, texSampler, texCoord + vec2f(0.866, -0.5) * fringe, 0.0);

  return vec4f(r.r, g.g, b.b, (r.a + g.a + b.a) / 3.0);
}

// The sharp image, its own small blur, the far field, then the near field over
// all three.
//
// The transition blur exists because between about one and three pixels of
// radius the half-resolution gather is too coarse to describe the blur, and
// switching straight to it pops as content crosses that width.
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

  var result = color.rgb;
  if (USE_DOF_TRANSITION_BLUR) {
    result = dofTransitionBlur(tex, texSampler, texCoord, min(radius, 3.0), params);
  }

  // Only a pixel that is itself behind the focal plane takes the far field: a
  // sharp object in front of a defocused background stays sharp to its edge.
  let far = dofSampleField(farTex, farSampler, texCoord, fringe);
  result = mix(result, far.rgb, saturateF32(max(-coc, 0.0) - 0.5));

  // Premultiplied, so this is "over" and not a mix.
  let near = dofSampleField(nearTex, nearSampler, texCoord, fringe);
  result = result * (1.0 - near.a) + near.rgb;

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
