/**
 * Threshold
 *
 * A pure cutoff on an already brightness-scored color: callers compute
 * exposure and pick a brightness metric (luma/luminance/average) themselves,
 * since those already exist as standalone chunks.
 *
 * @type {string}
 * @alias module:chunks.threshold
 */
export default /* wgsl */ `
fn threshold(color: vec4f, brightness: f32, thresholdValue: f32) -> vec4f {
  let smoothRange = 0.1;
  let t1 = thresholdValue * (1.0 - smoothRange);

  if (brightness > t1) {
    return color * smoothstep(t1, thresholdValue * (1.0 + smoothRange), brightness);
  }

  return vec4f(0.0);
}
`;
