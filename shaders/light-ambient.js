export default /* wgsl */ `
// color.w is luminance (cd/m²), matching the image based lighting it stands in
// for: an environment of uniform luminance L irradiates a surface with πL, and
// the Lambertian 1/π cancels it back to L.
fn EvaluateAmbientLight(data: ptr<function, PBRData>, light: SceneLight, ao: f32) {
  var lightColor = decode(light.color, SRGB).xyz;
  lightColor *= light.color.w;
  data.indirectDiffuse += ao * (data.diffuseColor * lightColor);
}
`;
