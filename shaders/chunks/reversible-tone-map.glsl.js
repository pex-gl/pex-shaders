/**
 * Reversible Tone Map
 *
 * Reference Implementations:
 * - "Optimized Reversible Tonemapper for Resolve", Timothy Lottes: https://gpuopen.com/learn/optimized-reversible-tonemapper-for-resolve/
 * @alias module:chunks.reversibleToneMap
 * @type {string}
 */
export default /* glsl */ `
vec3 reversibleToneMap(vec3 c) {
  return c / (max3(c) + 1.0);
}
vec3 reversibleToneMapInverse(vec3 c) {
  return c / (1.0 - max3(c));
}
`;
