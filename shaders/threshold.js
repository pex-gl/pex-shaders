/**
 * Threshold
 *
 * A bright pass on an already brightness-scored color: callers compute exposure
 * and pick a brightness metric (luma/luminance/average) themselves, since those
 * already exist as standalone shaders.
 *
 * Kino/Unity's quadratic soft knee. What passes is the amount _above_ the
 * threshold, not the whole color scaled by how far above it sits, so a value
 * crossing the threshold enters from zero instead of arriving at full
 * brightness. `softKnee` is the half-width of the ramp as a fraction of the
 * threshold; 0 is a hard cutoff, 0.5 a wide fade.
 *
 * The knee matters most where content sits at the threshold: without it a value
 * wobbling by a few percent — a temporal resolve leaves a residual, a thin
 * line's coverage changes, a circle of confusion is unsteady — swings the whole
 * cutoff and reads as flicker.
 *
 * @type {string}
 * @alias module:shaders.threshold
 */
export default /* wgsl */ `
fn thresholdSoft(brightness: f32, thresholdValue: f32, softKnee: f32) -> f32 {
  // The epsilon keeps the reciprocal finite at softKnee 0, which is what makes
  // that case a hard cutoff rather than a division by zero.
  let knee = thresholdValue * softKnee + 1e-5;
  let curve = vec3f(thresholdValue - knee, knee * 2.0, 0.25 / knee);

  var soft = clamp(brightness - curve.x, 0.0, curve.y);
  soft = curve.z * soft * soft;

  return max(soft, brightness - thresholdValue);
}

fn threshold(
  color: vec4f,
  brightness: f32,
  thresholdValue: f32,
  softKnee: f32
) -> vec4f {
  return color
    * thresholdSoft(brightness, thresholdValue, softKnee)
    / max(brightness, 1e-5);
}
`;
