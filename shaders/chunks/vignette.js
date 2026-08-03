// Alternatives:
// https://github.com/dataarts/3-dreams-of-black/blob/master/deploy/asset_viewer/js/rendering.js#L179
// let coord = (uv - center) * vec2f(radius);
// color = mix(color, vec3f(1.0 - intensity), dot(coord, coord));
//
// color *= smoothstep(radius + (uFStop / intensity), radius + (uFStop / intensity), distance(uv, center));
export default /* wgsl */ `
fn vignette(colorIn: vec3f, uv: vec2f, radius: f32, intensity: f32) -> vec3f {
  let center = vec2f(0.5);
  var color = colorIn;
  color *= smoothstep(-intensity, intensity, radius - distance(uv, center));
  return color;
}
`;
