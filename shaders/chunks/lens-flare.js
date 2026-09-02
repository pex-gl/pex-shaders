/**
 * Lens Flare
 *
 * Image-based flare: a bright pass resampled through the optical centre. Three
 * families, all of them the same image read at a different coordinate —
 * ghosts (the aperture imaged by a pair of internal reflections), a halo (the
 * ring a source at a fixed distance from the axis draws), and streaks (the
 * diaphragm's diffraction spikes).
 *
 * The arrangement Unity's HDRP screen space lens flare uses, which is Chapman's
 * "Pseudo Lens Flare" (2013) with the ring family added. The physically-based
 * tier — Hullin et al. (SIGGRAPH 2011), Lee and Eisemann (EGSR 2013) — traces
 * rays through an actual lens prescription and needs both a light list and a
 * description of the optics, so it is not a post-process at all. What this
 * borrows from it is where the numbers come from rather than how they are
 * drawn: the optical centre is the projection's principal point, dispersion is
 * lateral (it grows with distance from the axis and vanishes on it), and the
 * streak directions are the diaphragm's, not an artist's.
 *
 * Split into the families rather than shipped whole, since a scene that wants
 * only a starburst has no reason to compile the ghost loop: they share the
 * parameter block and the spectral sweep, and nothing else.
 *
 * Coordinates are UV throughout. `aspect` maps a UV delta into a square space
 * and back, so a distance that should be measured on screen — the halo radius,
 * a streak angle — is not silently measured in a stretched one.
 *
 * Sources
 *
 * - John Chapman, "Pseudo Lens Flare" (2013).
 *   https://john-chapman.github.io/2017/11/05/pseudo-lens-flare.html
 *   The ghost and halo formulation below: resample one bright pass through the
 *   optical centre instead of drawing sprites at a projected light position.
 * - Unity, "Screen Space Lens Flare" (HDRP/URP 14+).
 *   https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.core/Runtime/PostProcessing/Shaders/LensFlareScreenSpaceCommon.hlsl
 *   Chapman plus the polar family, the spectral sweep and the streak chain.
 *   `scaleUV`, `GetFlareTexture` and `FragmentComposition` are the functions
 *   these correspond to.
 * - Froyok (Lena Piquet), "Custom Lens-Flare in UE4" (2021).
 *   https://www.froyok.fr/blog/2021-09-ue4-custom-lens-flare/
 *   Why the ghosts read a blurred bright pass rather than a raw one.
 * - Masaki Kawase, "Frame Buffer Postprocessing Effects in DOUBLE-S.T.E.A.L",
 *   GDC 2003. http://www.daionet.gr.jp/~masa/archives/GDC2003_DSTEAL.ppt
 *   The streak filter: a few taps per pass, stride growing geometrically.
 * - Hullin et al., "Physically-Based Real-Time Lens Flare Rendering",
 *   SIGGRAPH 2011. doi:10.1145/2010324.1964936
 * - Lee and Eisemann, "Practical Real-Time Lens-Flare Rendering", EGSR 2013.
 *   doi:10.1111/cgf.12145
 *   The two above trace rays through a lens prescription and need a light list
 *   as well as the optics, so neither is a post-process. What this borrows from
 *   them is where the numbers come from: the optical centre is the projection's
 *   principal point, dispersion is lateral, and the streak axes are the
 *   diaphragm's.
 *
 * @type {object}
 * @name lensFlare
 * @static
 */

/**
 * Parameters, the optical centre remappings and the spectral sweep every family
 * samples through. Requires `math.TWO_PI`.
 *
 * @member {string}
 */
const common = /* wgsl */ `
struct LensFlareParams {
  // Optical centre in UV: the projection's principal point, not the middle of
  // the viewport. An off-centre or sheared frustum moves the axis every family
  // is mirrored through, and a flare drawn about the wrong one drifts against
  // the image it came from.
  center: vec2f,
  // Multiplies a UV delta into square screen space, (width / height, 1).
  aspect: vec2f,

  tint: vec3f,
  // Ceiling on the bright pass, applied before the threshold.
  //
  // Every family spreads a source's energy over an area, so what is left at a
  // given distance is the source's value times a falloff. Display white is a
  // fixed number, so the distance at which a flare stops being visible grows
  // with the source, and an unbounded HDR value draws a spike across the frame.
  // Unity's bloom carries the same control for the same reason.
  clamp: f32,

  // Ghosts on the far side of the axis, on the near side, and wrapped around it.
  ghostIntensity: f32,
  ghostReversedIntensity: f32,
  ghostWarpedIntensity: f32,
  ghostStart: f32,

  ghostSpacing: f32,
  ghostDimmer: f32,
  chromaticAberration: f32,
  haloIntensity: f32,

  haloRadius: f32,
  vignette: f32,
  exposure: f32,
  threshold: f32,

  softKnee: f32,
  streakIntensity: f32,
  streakThreshold: f32,
  // Angle between neighbouring streak axes.
  streakAngleStep: f32,

  streakRotation: f32,
  // Half a texel of the streak atlas, in band-local units.
  streakInset: f32,
  // Tap spacing of this streak iteration, in atlas texels.
  streakStride: f32,
}

override LENS_FLARE_CHROMATIC_SAMPLES: i32 = 4;
override USE_LENS_FLARE_CHROMATIC_ABERRATION: bool = true;

// Ghost i is the source image scaled about the optical centre. A negative scale
// is a point reflection through it, which is where a ghost formed by an even
// number of internal reflections actually lands.
fn lensFlareScaleUV(uv: vec2f, center: vec2f, scale: f32) -> vec2f {
  return center + (uv - center) / scale;
}

// The image wrapped around the optical centre: angle becomes u, radius becomes
// v. A bright point then draws an arc rather than a disc — the ring family a
// circular mount produces, and the one that reads as a lens rather than as a
// row of discs.
fn lensFlareWarpUV(uv: vec2f, params: LensFlareParams, scale: f32) -> vec2f {
  let d = (uv - params.center) * params.aspect * scale;

  return vec2f(
    0.5 + atan2(d.y, d.x) / TWO_PI,
    saturate(length(d) / length(params.aspect * 0.5))
  );
}

// Where the angular wrap falls, so the warped family can be faded across it.
//
// The polar remap is discontinuous along one ray from the centre: u runs off
// one edge of the image and back on the other, and clamping the sample turns
// that into a hard seam down the frame. Nothing recovers it — the coordinate
// genuinely has no neighbour there — so the family is faded instead.
fn lensFlareWarpSeam(uv: vec2f, params: LensFlareParams) -> f32 {
  let d = (uv - params.center) * params.aspect;
  let u = 0.5 + atan2(d.y, d.x) / TWO_PI;

  return smoothstep(0.0, 0.1, min(u, 1.0 - u));
}

// Radial displacement of the full spectral sweep.
//
// Lateral chromatic aberration grows with distance from the optical axis and
// vanishes on it — the cubic term is the usual fit — so dispersion shows at the
// frame edges and never in the middle. A constant per-channel offset, which is
// what a colour-fringe filter applies, is the one thing a lens does not do.
fn lensFlareDispersion(uv: vec2f, params: LensFlareParams) -> vec2f {
  let d = (uv - params.center) * 2.0;

  return -d * dot(d, d) * params.chromaticAberration;
}

// Three overlapping triangular lobes across the sweep.
//
// Not a fitted CIE curve: what the accumulation needs is that the lobes overlap
// and integrate to comparable weights, so normalising by the weight that landed
// returns neutral wherever the sweep sampled image throughout, and tints only
// where part of it ran off a bright region. That is where dispersion is visible
// in a photograph too — along an edge, not across a flat highlight.
fn lensFlareSpectrum(t: f32) -> vec3f {
  let x = saturate(t) * 3.0;

  return vec3f(
    max(0.0, 1.0 - abs(x - 2.5)),
    max(0.0, 1.0 - abs(x - 1.5)),
    max(0.0, 1.0 - abs(x - 0.5))
  );
}

// One flare sample, swept across the spectrum.
//
// Callers pass level 0: a ghost scaled up by three magnifies its source, and no
// mip level is finer than the one it already has, so softness has to be in the
// texture rather than selected per sample. Blurring the bright pass once is
// also one pass instead of one per family.
fn lensFlareSample(
  tex: texture_2d<f32>,
  texSampler: sampler,
  uv: vec2f,
  sweep: vec2f,
  lod: f32
) -> vec3f {
  if (!USE_LENS_FLARE_CHROMATIC_ABERRATION) {
    return textureSampleLevel(tex, texSampler, uv, lod).rgb;
  }

  var sum = vec3f(0.0);
  var weight = vec3f(0.0);
  var coord = uv;

  for (var i = 0; i < LENS_FLARE_CHROMATIC_SAMPLES; i++) {
    let lobe = lensFlareSpectrum((f32(i) + 0.5) / f32(LENS_FLARE_CHROMATIC_SAMPLES));
    sum += textureSampleLevel(tex, texSampler, coord, lod).rgb * lobe;
    weight += lobe;
    coord += sweep;
  }

  return sum / max(weight, vec3f(1e-5));
}

// Suppress flares near the optical axis.
//
// Every family's coordinates converge there, so a pixel on the axis receives
// every ghost at once, on top of the source that formed them. That reads as a
// smear over the highlight rather than as a flare, and it is the one place the
// image already has the light itself to show.
fn lensFlareVignette(uv: vec2f, params: LensFlareParams) -> f32 {
  let d = length((uv - params.center) * params.aspect) / length(params.aspect * 0.5);

  return mix(1.0, saturate(d * d), params.vignette);
}
`;

/**
 * Ghosts: the aperture imaged by pairs of internal reflections, scaled about
 * the optical centre. Requires {@link common}.
 *
 * @member {string}
 */
const ghosts = /* wgsl */ `
override LENS_FLARE_GHOSTS: i32 = 4;

// Every ghost of one family, summed.
//
// Scales grow as (i + start)^spacing rather than linearly. Ghost positions are
// set by which pair of surfaces reflected, so they crowd near the axis and
// spread towards the frame edge; an even march puts them at intervals no lens
// produces, which is what makes a flare read as a row of stickers.
//
// The side argument is +1 for ghosts on the source's own side of the axis and -1 for the
// far side. Both exist — the sign follows the number of reflections — and they
// carry separate intensities because only the count, not the optics, differs.
fn lensFlareGhosts(
  tex: texture_2d<f32>,
  texSampler: sampler,
  uv: vec2f,
  params: LensFlareParams,
  side: f32,
  warped: bool
) -> vec3f {
  let sweep = lensFlareDispersion(uv, params) / f32(LENS_FLARE_CHROMATIC_SAMPLES);

  var sum = vec3f(0.0);
  var dimmer = 1.0;

  for (var i = 0; i < LENS_FLARE_GHOSTS; i++) {
    let scale = pow(f32(i) + params.ghostStart, params.ghostSpacing);
    // Both arms are arithmetic on values already in registers, so selecting
    // costs less than branching on a value uniform across the draw.
    let coord = select(
      lensFlareScaleUV(uv, params.center, side * scale),
      lensFlareWarpUV(uv, params, 1.0 / scale),
      warped
    );

    sum += lensFlareSample(tex, texSampler, coord, side * sweep, 0.0) * dimmer;
    dimmer *= params.ghostDimmer;
  }

  return sum;
}
`;

/**
 * Halo: everything at a fixed distance from the optical axis, brought to the
 * same radius. Requires {@link common}.
 *
 * @member {string}
 */
const halo = /* wgsl */ `
// The offset is radial and constant in length, so a bright point at radius r
// lands on the whole circle of radius r - haloRadius. The ring is the sampling
// geometry rather than a shape drawn over the image, which is why it tracks a
// source that moves instead of sitting where it was authored.
//
// Its dispersion is the strongest of the three families because the sweep is
// radial too and so runs along the ring's own gradient — a real halo is
// rainbow-edged for the same reason.
fn lensFlareHalo(
  tex: texture_2d<f32>,
  texSampler: sampler,
  uv: vec2f,
  params: LensFlareParams
) -> vec3f {
  let d = (uv - params.center) * params.aspect;
  let distance = length(d);
  if (distance < 1e-4) { return vec3f(0.0); }

  let coord = uv - (d / distance) * params.haloRadius / params.aspect;
  let sweep = lensFlareDispersion(uv, params) / f32(LENS_FLARE_CHROMATIC_SAMPLES);

  // Inside the radius the offset reaches past the axis and folds the image back
  // through itself, so the ring is faded in over its own width instead.
  return lensFlareSample(tex, texSampler, coord, sweep, 0.0)
    * smoothstep(0.0, params.haloRadius, distance);
}
`;

/**
 * Streaks: the diaphragm's diffraction spikes, as one directional blur chain
 * per spike axis. Requires {@link common}.
 *
 * Every direction lives in one texture, as a horizontal band. The chains have
 * to stay separate — blurring a spike along another spike's axis thickens it
 * into a blob rather than crossing it — but they are the same filter with a
 * different vector, so banding them keeps the chain at one pass per iteration
 * whatever the blade count, instead of one per iteration per direction.
 *
 * @member {string}
 */
const streak = /* wgsl */ `
override LENS_FLARE_STREAK_DIRECTIONS: i32 = 1;

// Which band a row of the atlas belongs to.
fn lensFlareStreakBand(v: f32) -> f32 {
  return min(
    floor(saturate(v) * f32(LENS_FLARE_STREAK_DIRECTIONS)),
    f32(LENS_FLARE_STREAK_DIRECTIONS) - 1.0
  );
}

// Position within a band, so a tap steps in image units and not atlas ones.
fn lensFlareStreakLocal(uv: vec2f, band: f32) -> vec2f {
  return vec2f(uv.x, uv.y * f32(LENS_FLARE_STREAK_DIRECTIONS) - band);
}

// Band-local position back to an atlas coordinate.
//
// The vertical clamp is the band's edge standing in for the image's: a tap that
// walked into the neighbouring band would draw that direction's spike along
// this one's axis. Inset by half a texel because the sampler filters across the
// boundary before the clamp can be seen.
fn lensFlareStreakAtlasUV(local: vec2f, band: f32, inset: f32) -> vec2f {
  return vec2f(
    saturate(local.x),
    (band + clamp(local.y, inset, 1.0 - inset)) / f32(LENS_FLARE_STREAK_DIRECTIONS)
  );
}

// The axis a band's spike runs along.
//
// A straight-edged aperture puts a spike perpendicular to each edge, so an even
// blade count gives as many spikes as blades — opposite edges are parallel and
// their spikes coincide — and an odd count gives twice that. A chain is
// bidirectional either way, so each covers two of them.
fn lensFlareStreakDirection(band: f32, params: LensFlareParams) -> vec2f {
  let angle = params.streakRotation + band * params.streakAngleStep;

  return vec2f(cos(angle), sin(angle));
}

// One iteration of a directional streak chain: six taps, tent weighted, spaced
// one stride apart.
//
// Kawase's streak filter (GDC 2004), which is what HDRP's anamorphic streaks
// still are. A diffraction spike is a one-dimensional point spread function, so
// a separable chain along its axis reproduces it rather than approximating it,
// and a stride that grows geometrically buys reach in log passes.
//
// Taps sit at half-integer multiples so their spacing *is* the stride: the six
// of them cover a contiguous run, and the next iteration's copies of that run
// abut instead of interleaving. Spacing them two strides apart — which is what
// HDRP's downsampler does — leaves every second position empty, and HDRP gets
// away with it only because each of its iterations also halves the resolution,
// so the next one's bilinear fetch averages across the holes. At a fixed
// resolution nothing ever fills them and the spike comes out as a string of
// beads.
fn lensFlareStreakBlur(
  tex: texture_2d<f32>,
  texSampler: sampler,
  local: vec2f,
  band: f32,
  stride: vec2f,
  inset: f32
) -> vec3f {
  var sum = vec3f(0.0);

  for (var i = 0; i < 6; i++) {
    let offset = f32(i) - 2.5;
    // Linear in the distance and reaching zero one stride past the last tap, so
    // the chain converges on a Gaussian instead of ringing the way a box does.
    let weight = 3.5 - abs(offset);

    sum += textureSampleLevel(
      tex,
      texSampler,
      lensFlareStreakAtlasUV(local + stride * offset, band, inset),
      0.0
    ).rgb * weight;
  }

  return sum / 12.0;
}

// One band of the finished atlas, dispersed.
//
// Sampled per channel along the radial displacement rather than through the
// spectral sweep the ghosts use: every tap has to be clamped into its own band,
// and three carry a spike's rainbow tip as well as a sweep would — the gradient
// along a spike is one-dimensional, so there is nothing for more samples to
// resolve. Long wavelengths diffract furthest, so red is displaced outwards.
fn lensFlareStreakSample(
  tex: texture_2d<f32>,
  texSampler: sampler,
  local: vec2f,
  band: f32,
  sweep: vec2f,
  inset: f32
) -> vec3f {
  return vec3f(
    textureSampleLevel(tex, texSampler, lensFlareStreakAtlasUV(local - sweep, band, inset), 0.0).r,
    textureSampleLevel(tex, texSampler, lensFlareStreakAtlasUV(local - sweep * 0.5, band, inset), 0.0).g,
    textureSampleLevel(tex, texSampler, lensFlareStreakAtlasUV(local, band, inset), 0.0).b
  );
}
`;

export { common, ghosts, halo, streak };
