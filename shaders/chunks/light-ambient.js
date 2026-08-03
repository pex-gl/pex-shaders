export default /* wgsl */ `
struct AmbientLight {
  color: vec4f,
};

fn EvaluateAmbientLight(data: ptr<function, PBRData>, light: AmbientLight, ao: f32) {
  var lightColor = decode(light.color, SRGB).xyz;
  lightColor *= light.color.w;
  data.indirectDiffuse += ao * (data.diffuseColor * lightColor);
}
`;
