/**
 * Film Grain
 *
 * Reference Implementations:
 * - https://devlog-martinsh.blogspot.com/2013/05/image-imperfections-and-film-grain-post.html
 * - https://www.shadertoy.com/view/4sSXDW
 *
 * @alias module:chunks.filmGrain
 * @type {string}
 */
export default /* glsl */ `
const vec3 FILM_GRAIN_TIME_OFFSET = vec3(0.07, 0.11, 0.13);
const vec2 FILM_GRAIN_CHANNEL_OFFSET = vec2(1.1, 1.2);

// Random
#if FILM_GRAIN_QUALITY == 0
  float filmGrainRandom(vec2 uv, float time) {
    return rand(uv * (1.0 + fract(time))) * 2.0 - 1.0;
  }
  vec3 filmGrainRandom(vec2 uv, float time, float size, float colorIntensity) {
    float n = filmGrainRandom(uv * size, time * FILM_GRAIN_TIME_OFFSET.x);

    return vec3(
      n,
      mix(n, filmGrainRandom(uv * FILM_GRAIN_CHANNEL_OFFSET.x * size, time * FILM_GRAIN_TIME_OFFSET.y), colorIntensity),
      mix(n, filmGrainRandom(uv * FILM_GRAIN_CHANNEL_OFFSET.y * size, time * FILM_GRAIN_TIME_OFFSET.z), colorIntensity)
    );
  }
// Large Film Grain Lottes
#elif FILM_GRAIN_QUALITY == 1
  float filmGrainLargeStep1(vec2 uv, float n) {
    float b = 2.0;
    float c = -12.0;

    return (1.0 / (4.0 + b * 4.0 + abs(c))) * (
      rand((uv + vec2(-1.0,-1.0)) + n) +
      rand((uv + vec2( 0.0,-1.0)) + n) * b +
      rand((uv + vec2( 1.0,-1.0)) + n) +
      rand((uv + vec2(-1.0, 0.0)) + n) * b +
      rand((uv + vec2( 0.0, 0.0)) + n) * c +
      rand((uv + vec2( 1.0, 0.0)) + n) * b +
      rand((uv + vec2(-1.0, 1.0)) + n) +
      rand((uv + vec2( 0.0, 1.0)) + n) * b +
      rand((uv + vec2( 1.0, 1.0)) + n)
    );
  }
  float filmGrainLargeStep2(vec2 uv, float n) {
    float b = 2.0;
    float c = 4.0;

    return (1.0 / (4.0 + b * 4.0 + c)) * (
      filmGrainLargeStep1(uv + vec2(-1.0, -1.0), n) +
      filmGrainLargeStep1(uv + vec2( 0.0, -1.0), n) * b +
      filmGrainLargeStep1(uv + vec2( 1.0, -1.0), n) +
      filmGrainLargeStep1(uv + vec2(-1.0,  0.0), n) * b +
      filmGrainLargeStep1(uv + vec2( 0.0,  0.0), n) * c +
      filmGrainLargeStep1(uv + vec2( 1.0,  0.0), n) * b +
      filmGrainLargeStep1(uv + vec2(-1.0,  1.0), n) +
      filmGrainLargeStep1(uv + vec2( 0.0,  1.0), n) * b +
      filmGrainLargeStep1(uv + vec2( 1.0,  1.0), n)
    );
  }
  vec3 filmGrainLarge(vec2 uv, float time, float size, float colorIntensity) {
    float scale = 18.0; // Match filmGrainRandom
    float n = filmGrainLargeStep2(uv * size, FILM_GRAIN_TIME_OFFSET.x * time);

    return scale * vec3(
      n,
      mix(n, filmGrainLargeStep2(uv * FILM_GRAIN_CHANNEL_OFFSET.x * size, FILM_GRAIN_TIME_OFFSET.y * time), colorIntensity),
      mix(n, filmGrainLargeStep2(uv * FILM_GRAIN_CHANNEL_OFFSET.y * size, FILM_GRAIN_TIME_OFFSET.z * time), colorIntensity)
    );
  }

// Upitis with periodic simplex noise
#elif FILM_GRAIN_QUALITY == 2
  const vec3 FILM_GRAIN_ROTATION_OFFSET = vec3(1.425, 3.892, 5.835);

  vec2 filmGrainRotate(vec2 uv, float angle, float aspect) {
    float cosAngle = cos(angle);
    float sinAngle = sin(angle);
    vec2 p = uv * 2.0 - 1.0;
    return vec2(
      (cosAngle * aspect * p.x - sinAngle * p.y) / aspect,
      cosAngle * p.y + sinAngle * aspect * p.x
    ) * 0.5 + 0.5;
  }

  float filmGrainUpitis(vec2 uv, float angle, vec2 offset, float aspect, float z, vec3 rep) {
    return pnoise(vec3(offset * filmGrainRotate(uv, angle, aspect), z), rep);
  }
  vec3 filmGrainUpitis(vec2 uv, float time, float size, float colorIntensity, vec2 viewportSize) {
    vec2 offset = viewportSize / vec2(size);
    float aspect = viewportSize.x / viewportSize.y;

    vec3 rep = vec3(uv + vec2(time), 1.0);
    float n = filmGrainUpitis(uv, time + FILM_GRAIN_ROTATION_OFFSET.x, offset, aspect, 0.0, rep);

    return vec3(
      n,
      mix(n, filmGrainUpitis(uv, time + FILM_GRAIN_ROTATION_OFFSET.y, offset, aspect, 1.0, rep), colorIntensity),
      mix(n, filmGrainUpitis(uv, time + FILM_GRAIN_ROTATION_OFFSET.z, offset, aspect, 2.0, rep), colorIntensity)
    );
  }
#endif

vec3 filmGrain(
  vec3 color,
  vec2 uv,
  vec2 viewportSize,
  float size,
  float intensity,
  float colorIntensity,
  float luminanceIntensity,
  float time
) {
  #if FILM_GRAIN_QUALITY == 0
    vec3 noise = filmGrainRandom(uv, time, size, colorIntensity);
  #elif FILM_GRAIN_QUALITY == 1
    vec3 noise = filmGrainLarge(uv, time, size, colorIntensity);
  #elif FILM_GRAIN_QUALITY == 2
    vec3 noise = filmGrainUpitis(uv, time, size, colorIntensity, viewportSize);
  #endif

  float luminance = mix(0.0, luma(color), luminanceIntensity);
  return color + mix(noise, vec3(0.0), pow(luminance + smoothstep(0.2, 0.0, luminance), 4.0)) * intensity;
}
`;
