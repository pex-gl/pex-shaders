/**
 * Reversible Tone Map
 *
 * Reference Implementations:
 *
 * - "Optimized Reversible Tonemapper for Resolve", Timothy Lottes:
 *   https://gpuopen.com/learn/optimized-reversible-tonemapper-for-resolve/
 *
 * @type {string}
 * @alias module:chunks.reversibleToneMap
 */
export default /* wgsl */ `
fn reversibleToneMap(c: vec3f) -> vec3f {
  return c / (max3(c) + 1.0);
}
fn reversibleToneMapInverse(c: vec3f) -> vec3f {
  return c / (1.0 - max3(c));
}
`;
