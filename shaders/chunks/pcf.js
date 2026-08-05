// Percentage-closer filtering on depth textures using a comparison sampler.
// textureSampleCompareLevel does the depth test (and 2x2 hardware filtering with
// a linear comparison sampler) at an explicit LOD, so it is safe in non-uniform
// control flow (unlike textureSampleCompare). `compare` is the receiver's
// clip-space [0, 1] depth in the light's projection.
const PCF = /* wgsl */ `
fn texture2DCompare(depths: texture_depth_2d, depthSampler: sampler_comparison, uv: vec2f, compare: f32) -> f32 {
  return textureSampleCompareLevel(depths, depthSampler, uv, compare);
}

fn PCF3x3(depths: texture_depth_2d, depthSampler: sampler_comparison, size: vec2f, uv: vec2f, compare: f32) -> f32 {
  var result = 0.0;
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      result += texture2DCompare(depths, depthSampler, uv + vec2f(f32(x), f32(y)) / size, compare);
    }
  }
  return result / 9.0;
}

fn PCF5x5(depths: texture_depth_2d, depthSampler: sampler_comparison, size: vec2f, uv: vec2f, compare: f32) -> f32 {
  var result = 0.0;
  for (var x = -2; x <= 2; x++) {
    for (var y = -2; y <= 2; y++) {
      result += texture2DCompare(depths, depthSampler, uv + vec2f(f32(x), f32(y)) / size, compare);
    }
  }
  return result / 25.0;
}
`;

const PCFCube = /* wgsl */ `
// Cube depth maps use a regular sampler (textureLoad is unavailable on cubes, so
// PCSS's blocker search needs raw reads); the compare is done manually. Lit (1)
// when the receiver's depth is nearer than (<=) the stored occluder depth.
fn textureCubeCompare(depths: texture_depth_cube, depthSampler: sampler, direction: vec3f, compare: f32) -> f32 {
  // Depth textures take an integer mip level (no mip interpolation).
  let depth = textureSampleLevel(depths, depthSampler, direction, 0);
  return step(compare, depth);
}

// https://learnopengl.com/Advanced-Lighting/Shadows/Point-Shadows
const sampleOffsetDirections = array<vec3f, 20>(
  vec3f(1, 1, 1), vec3f(1, -1, 1), vec3f(-1, -1, 1), vec3f(-1, 1, 1),
  vec3f(1, 1, -1), vec3f(1, -1, -1), vec3f(-1, -1, -1), vec3f(-1, 1, -1),
  vec3f(1, 1, 0), vec3f(1, -1, 0), vec3f(-1, -1, 0), vec3f(-1, 1, 0),
  vec3f(1, 0, 1), vec3f(-1, 0, 1), vec3f(1, 0, -1), vec3f(-1, 0, -1),
  vec3f(0, 1, 1), vec3f(0, -1, 1), vec3f(0, -1, -1), vec3f(0, 1, -1)
);

fn PCFCube(depths: texture_depth_cube, depthSampler: sampler, size: vec2f, direction: vec3f, compare: f32) -> f32 {
  var result = 0.0;
  for (var i = 0; i < 20; i++) {
    result += textureCubeCompare(depths, depthSampler, direction + sampleOffsetDirections[i] / size.x, compare);
  }
  return result / 20.0;
}
`;

export { PCF, PCFCube };
