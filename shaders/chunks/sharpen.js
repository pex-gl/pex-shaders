/**
 * RCAS (Robust Contrast Adaptive Sharpening)
 *
 * The sharpening pass from AMD FidelityFX Super Resolution 1.0, which is CAS
 * reduced to what is safe to run after a resolve: no scaling, and a limiter
 * derived from the local range so it cannot ring.
 *
 * Reference:
 * https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h
 *
 * Takes its five taps as parameters rather than sampling: the limiter assumes a
 * roughly [0, 1] signal, so a caller working in HDR has to normalise before it
 * reaches here and undo that after.
 *
 * Requires `math.max3`.
 *
 * Updates: Damien Seguin (2026-08)
 *
 * @member {string}
 */
export default /* wgsl */ `
// The strongest lobe the filter is allowed to reach, from the reference. Past
// it the negative surrounding weights overshoot into visible ringing.
const RCAS_LIMIT: f32 = 0.25 - 1.0 / 16.0;

// Guards the two reciprocals below, which are 0/0 on a fully black or fully
// white neighbourhood.
const RCAS_EPSILON: f32 = 1e-4;

/**
 * The cross around the pixel being sharpened:
 *
 *     b
 *   d e f
 *     h
 *
 * \`sharpness\` scales the lobe, 0 leaving the centre tap untouched and 1 giving
 * the reference's strongest setting — it stands in for FSR's \`exp2(-stops)\`,
 * which covers the same range from the other direction.
 */
fn rcas(b: vec3f, d: vec3f, e: vec3f, f: vec3f, h: vec3f, sharpness: f32) -> vec3f {
  let mn4 = min(min(b, d), min(f, h));
  let mx4 = max(max(b, d), max(f, h));

  // How far the centre could move before it leaves the range its neighbours
  // describe — towards black and towards white respectively. Both are per
  // channel, because a channel that is already at an extreme is the one that
  // would ring first.
  let hitMin = min(mn4, e) / max(4.0 * mx4, vec3f(RCAS_EPSILON));
  let hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, vec3f(-RCAS_EPSILON));

  // The tightest channel governs, so colour cannot drift where one channel
  // still has room and another does not.
  let lobeRGB = max(-hitMin, hitMax);
  let lobe =
    max(-RCAS_LIMIT, min(max3(lobeRGB), 0.0)) * sharpness;

  // A negative lobe on the neighbours is what sharpens; the reciprocal
  // renormalises so a flat neighbourhood comes back unchanged.
  return (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);
}
`;
