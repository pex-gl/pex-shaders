/**
 * Color Correction
 *
 * https://github.com/CesiumGS/cesium/blob/master/Source/Shaders/Builtin/Functions
 *
 * @type {string}
 * @alias module:chunks.colorCorrection
 */
export default /* wgsl */ `
fn brightnessContrastF32(value: f32, brightness: f32, contrast: f32) -> f32 {
  return (value - 0.5) * contrast + 0.5 + brightness;
}

fn brightnessContrastVec3(value: vec3f, brightness: f32, contrast: f32) -> vec3f {
  return (value - 0.5) * contrast + 0.5 + brightness;
}

fn saturation(rgb: vec3f, adjustment: f32) -> vec3f {
  let W = vec3f(0.2125, 0.7154, 0.0721);
  let intensity = vec3f(dot(rgb, W));
  return mix(intensity, rgb, adjustment);
}

fn hue(rgb: vec3f, adjustment: f32) -> vec3f {
  let toYIQ = mat3x3f(
    0.299, 0.587, 0.114,
    0.595716, -0.274453, -0.321263,
    0.211456, -0.522591, 0.311135
  );
  let toRGB = mat3x3f(
    1.0, 0.9563, 0.6210,
    1.0, -0.2721, -0.6474,
    1.0, -1.107, 1.7046
  );

  let yiq = toYIQ * rgb;
  let hueAngle = atan2(yiq.z, yiq.y) + adjustment;
  let chroma = sqrt(yiq.z * yiq.z + yiq.y * yiq.y);

  let color = vec3f(yiq.x, chroma * cos(hueAngle), chroma * sin(hueAngle));
  return toRGB * color;
}
`;
