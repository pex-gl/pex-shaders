export default /* wgsl */ `
fn envMapOctahedral(dirIn: vec3f) -> vec2f {
  var dir = dirIn;
  dir /= dot(vec3f(1.0), abs(dir));
  // Add epsylon to avoid bottom face flickering when sampling irradiance
  dir += 0.00001;
  if (dir.y < 0.0) {
    dir = vec3f(vec2f(1.0 - abs(dir.zx)) * sign(dir.xz), dir.z);
  } else {
    dir = vec3f(dir.xz, dir.z);
  }
  dir = vec3f(dir.xy * 0.5, dir.z);
  dir = vec3f(dir.xy + 0.5, dir.z); // move to center
  return dir.xy;
}

fn envMapOctahedralSized(dirIn: vec3f, textureSize: f32) -> vec2f {
  var dir = dirIn;
  dir /= dot(vec3f(1.0), abs(dir));
  if (dir.y < 0.0) {
    dir = vec3f(vec2f(1.0 - abs(dir.zx)) * sign(dir.xz), dir.z);
  } else {
    dir = vec3f(dir.xz, dir.z);
  }
  dir = vec3f(dir.xy * 0.5, dir.z);
  dir = vec3f(dir.xy + 0.5, dir.z); // move to center

  // center on texels
  dir = vec3f(dir.xy + 0.5 / textureSize, dir.z);
  dir = vec3f(dir.xy / (textureSize / (textureSize - 1.0)), dir.z);

  return dir.xy;
}

fn envMapOctahedralAtlas(dir: vec3f, mipmapLevel: f32, roughnessLevel: f32, octMapAtlasSize: f32) -> vec2f {
  let width = octMapAtlasSize;
  let maxLevel = log2(width); // this should come from log of size
  let levelSizeInPixels = pow(2.0, 1.0 + mipmapLevel + roughnessLevel);
  let levelSize = max(64.0, width / levelSizeInPixels);
  let roughnessLevelWidth = width / pow(2.0, 1.0 + roughnessLevel);
  let vOffset = width - pow(2.0, maxLevel - roughnessLevel);
  let hOffset = 2.0 * roughnessLevelWidth - pow(2.0, log2(2.0 * roughnessLevelWidth) - mipmapLevel);
  var uv = envMapOctahedralSized(dir, levelSize);
  uv *= levelSize;

  return (uv + vec2f(hOffset, vOffset)) / width;
}
`;
