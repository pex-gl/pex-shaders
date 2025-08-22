// Alternatives:
// https://github.com/dataarts/3-dreams-of-black/blob/master/deploy/asset_viewer/js/rendering.js#L179
// vec2 coord = (uv - center) * vec2(radius);
// color.rgb = mix(color.rgb, vec3(1.0 - intensity), dot(coord, coord));
//
// color.rgb *= smoothstep(radius + (uFStop / intensity), radius + (uFStop / intensity), distance(uv, center));
export default /* glsl */ `
vec3 vignette(in vec3 color, vec2 uv, float radius, float intensity) {
  const vec2 center = vec2(0.5);
  color.rgb *= smoothstep(-intensity, intensity, radius - distance(uv, center));
  return color;
}
`;
