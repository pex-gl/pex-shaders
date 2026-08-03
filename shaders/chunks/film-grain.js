/**
 * Film Grain
 *
 * Reference Implementations:
 *
 * - https://devlog-martinsh.blogspot.com/2013/05/image-imperfections-and-film-grain-post.html
 * - https://www.shadertoy.com/view/4sSXDW
 *
 * @type {string}
 * @alias module:chunks.filmGrain
 */
export default /* wgsl */ `
const FILM_GRAIN_TIME_OFFSET = vec3f(0.07, 0.11, 0.13);
const FILM_GRAIN_CHANNEL_OFFSET = vec2f(1.1, 1.2);

// FILM_GRAIN_QUALITY is expected to be declared as \`override\` i32 by the
// composing pipeline shader (0 = Random, 1 = Large Film Grain Lottes,
// 2 = Upitis with periodic simplex noise).

// Random
fn filmGrainRandom(uv: vec2f, time: f32) -> f32 {
  return rand(uv * (1.0 + fract(time))) * 2.0 - 1.0;
}
fn filmGrainRandomColor(uv: vec2f, time: f32, size: f32, colorIntensity: f32) -> vec3f {
  let n = filmGrainRandom(uv * size, time * FILM_GRAIN_TIME_OFFSET.x);

  return vec3f(
    n,
    mix(n, filmGrainRandom(uv * FILM_GRAIN_CHANNEL_OFFSET.x * size, time * FILM_GRAIN_TIME_OFFSET.y), colorIntensity),
    mix(n, filmGrainRandom(uv * FILM_GRAIN_CHANNEL_OFFSET.y * size, time * FILM_GRAIN_TIME_OFFSET.z), colorIntensity)
  );
}

// Large Film Grain Lottes
fn filmGrainLargeStep1(uv: vec2f, n: f32) -> f32 {
  let b = 2.0;
  let c = -12.0;

  return (1.0 / (4.0 + b * 4.0 + abs(c))) * (
    rand((uv + vec2f(-1.0, -1.0)) + n) +
    rand((uv + vec2f(0.0, -1.0)) + n) * b +
    rand((uv + vec2f(1.0, -1.0)) + n) +
    rand((uv + vec2f(-1.0, 0.0)) + n) * b +
    rand((uv + vec2f(0.0, 0.0)) + n) * c +
    rand((uv + vec2f(1.0, 0.0)) + n) * b +
    rand((uv + vec2f(-1.0, 1.0)) + n) +
    rand((uv + vec2f(0.0, 1.0)) + n) * b +
    rand((uv + vec2f(1.0, 1.0)) + n)
  );
}
fn filmGrainLargeStep2(uv: vec2f, n: f32) -> f32 {
  let b = 2.0;
  let c = 4.0;

  return (1.0 / (4.0 + b * 4.0 + c)) * (
    filmGrainLargeStep1(uv + vec2f(-1.0, -1.0), n) +
    filmGrainLargeStep1(uv + vec2f(0.0, -1.0), n) * b +
    filmGrainLargeStep1(uv + vec2f(1.0, -1.0), n) +
    filmGrainLargeStep1(uv + vec2f(-1.0, 0.0), n) * b +
    filmGrainLargeStep1(uv + vec2f(0.0, 0.0), n) * c +
    filmGrainLargeStep1(uv + vec2f(1.0, 0.0), n) * b +
    filmGrainLargeStep1(uv + vec2f(-1.0, 1.0), n) +
    filmGrainLargeStep1(uv + vec2f(0.0, 1.0), n) * b +
    filmGrainLargeStep1(uv + vec2f(1.0, 1.0), n)
  );
}
fn filmGrainLarge(uv: vec2f, time: f32, size: f32, colorIntensity: f32) -> vec3f {
  let scale = 18.0; // Match filmGrainRandom
  let n = filmGrainLargeStep2(uv * size, FILM_GRAIN_TIME_OFFSET.x * time);

  return scale * vec3f(
    n,
    mix(n, filmGrainLargeStep2(uv * FILM_GRAIN_CHANNEL_OFFSET.x * size, FILM_GRAIN_TIME_OFFSET.y * time), colorIntensity),
    mix(n, filmGrainLargeStep2(uv * FILM_GRAIN_CHANNEL_OFFSET.y * size, FILM_GRAIN_TIME_OFFSET.z * time), colorIntensity)
  );
}

// Upitis with periodic simplex noise
const FILM_GRAIN_ROTATION_OFFSET = vec3f(1.425, 3.892, 5.835);

fn filmGrainRotate(uv: vec2f, angle: f32, aspect: f32) -> vec2f {
  let cosAngle = cos(angle);
  let sinAngle = sin(angle);
  let p = uv * 2.0 - 1.0;
  return vec2f(
    (cosAngle * aspect * p.x - sinAngle * p.y) / aspect,
    cosAngle * p.y + sinAngle * aspect * p.x
  ) * 0.5 + 0.5;
}

fn filmGrainUpitis(uv: vec2f, angle: f32, offset: vec2f, aspect: f32, z: f32, rep: vec3f) -> f32 {
  return pnoiseVec3(vec3f(offset * filmGrainRotate(uv, angle, aspect), z), rep);
}
fn filmGrainUpitisColor(uv: vec2f, time: f32, size: f32, colorIntensity: f32, viewportSize: vec2f) -> vec3f {
  let offset = viewportSize / vec2f(size);
  let aspect = viewportSize.x / viewportSize.y;

  let rep = vec3f(uv + vec2f(time), 1.0);
  let n = filmGrainUpitis(uv, time + FILM_GRAIN_ROTATION_OFFSET.x, offset, aspect, 0.0, rep);

  return vec3f(
    n,
    mix(n, filmGrainUpitis(uv, time + FILM_GRAIN_ROTATION_OFFSET.y, offset, aspect, 1.0, rep), colorIntensity),
    mix(n, filmGrainUpitis(uv, time + FILM_GRAIN_ROTATION_OFFSET.z, offset, aspect, 2.0, rep), colorIntensity)
  );
}

fn filmGrain(
  color: vec3f,
  luma: f32,
  uv: vec2f,
  viewportSize: vec2f,
  size: f32,
  intensity: f32,
  colorIntensity: f32,
  luminanceIntensity: f32,
  time: f32
) -> vec3f {
  var noise: vec3f;
  if (FILM_GRAIN_QUALITY == 0) {
    noise = filmGrainRandomColor(uv, time, size, colorIntensity);
  } else if (FILM_GRAIN_QUALITY == 1) {
    noise = filmGrainLarge(uv, time, size, colorIntensity);
  } else {
    noise = filmGrainUpitisColor(uv, time, size, colorIntensity, viewportSize);
  }

  let luminance = mix(0.0, luma, luminanceIntensity);
  return saturateVec3(color + mix(noise, vec3f(0.0), pow(luminance + smoothstep(0.2, 0.0, luminance), 4.0)) * intensity);
}
`;
