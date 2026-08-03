const PCF = /* wgsl */ `
fn texture2DCompare(depths: texture_2d<f32>, depthSampler: sampler, uv: vec2f, compare: f32, near: f32, far: f32, ortho: bool) -> f32 {
  var depth: f32;
  if (ortho) {
    depth = readDepthOrtho(depths, depthSampler, uv, near, far);
  } else {
    depth = readDepth(depths, depthSampler, uv, near, far);
  }
  if (depth >= far - DEPTH_TOLERANCE) {
    return 1.0;
  }
  return step(compare, depth);
}

fn texture2DShadowLerp(depths: texture_2d<f32>, depthSampler: sampler, size: vec2f, uv: vec2f, compare: f32, near: f32, far: f32, ortho: bool) -> f32 {
  let texelSize = vec2f(1.0) / size;
  let f = fract(uv * size + 0.5);
  let centroidUV = floor(uv * size + 0.5) / size;

  let lb = texture2DCompare(depths, depthSampler, centroidUV + texelSize * vec2f(0.0, 0.0), compare, near, far, ortho);
  let lt = texture2DCompare(depths, depthSampler, centroidUV + texelSize * vec2f(0.0, 1.0), compare, near, far, ortho);
  let rb = texture2DCompare(depths, depthSampler, centroidUV + texelSize * vec2f(1.0, 0.0), compare, near, far, ortho);
  let rt = texture2DCompare(depths, depthSampler, centroidUV + texelSize * vec2f(1.0, 1.0), compare, near, far, ortho);
  let a = mix(lb, lt, f.y);
  let b = mix(rb, rt, f.y);
  return mix(a, b, f.x);
}

fn PCF3x3(depths: texture_2d<f32>, depthSampler: sampler, size: vec2f, uv: vec2f, compare: f32, near: f32, far: f32, ortho: bool) -> f32 {
  var result = 0.0;
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      let off = vec2f(f32(x), f32(y)) / size;
      result += texture2DShadowLerp(depths, depthSampler, size, uv + off, compare, near, far, ortho);
    }
  }
  return result / 9.0;
}

fn PCF5x5(depths: texture_2d<f32>, depthSampler: sampler, size: vec2f, uv: vec2f, compare: f32, near: f32, far: f32, ortho: bool) -> f32 {
  var result = 0.0;
  for (var x = -2; x <= 2; x++) {
    for (var y = -2; y <= 2; y++) {
      let off = vec2f(f32(x), f32(y)) / size;
      result += texture2DShadowLerp(depths, depthSampler, size, uv + off, compare, near, far, ortho);
    }
  }
  return result / 25.0;
}
`;

const PCFCube = /* wgsl */ `
fn textureCubeCompare(depths: texture_cube<f32>, depthSampler: sampler, direction: vec3f, compare: f32) -> f32 {
  let depth = unpackDepth(textureSampleLevel(depths, depthSampler, direction, 0.0)) * DEPTH_PACK_FAR;
  if (depth >= DEPTH_PACK_FAR - DEPTH_TOLERANCE) {
    return 1.0;
  }
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

fn PCFCube(depths: texture_cube<f32>, depthSampler: sampler, size: vec2f, direction: vec3f, compare: f32) -> f32 {
  var result = 0.0;

  for (var i = 0; i < 20; i++) {
    result += textureCubeCompare(depths, depthSampler, direction + sampleOffsetDirections[i] / size.x, compare);
  }

  return result / 20.0;
}
`;

export { PCF, PCFCube };
