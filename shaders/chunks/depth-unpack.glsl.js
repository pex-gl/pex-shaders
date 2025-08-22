export default /* glsl */ `
#ifndef DEPTH_PACK_FAR
  #define DEPTH_PACK_FAR 10.0
#endif

float unpackDepth (const in vec4 rgba_depth) {
  const vec4 bit_shift = vec4(1.0/(256.0*256.0*256.0), 1.0/(256.0*256.0), 1.0/256.0, 1.0);
  float depth = dot(rgba_depth, bit_shift);
  return depth;
}
`;
