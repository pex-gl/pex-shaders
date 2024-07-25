const PCF = /* glsl */ `
float texture2DCompare(sampler2D depths, vec2 uv, float compare, float near, float far) {
  float depth = readDepthOrtho(depths, uv, near, far);
  if (depth >= far - DEPTH_TOLERANCE) return 1.0;
  return step(compare, depth);
}

float texture2DShadowLerp(sampler2D depths, vec2 size, vec2 uv, float compare, float near, float far) {
  vec2 texelSize = vec2(1.0) / size;
  vec2 f = fract(uv * size + 0.5);
  vec2 centroidUV = floor(uv * size + 0.5) / size;

  float lb = texture2DCompare(depths, centroidUV + texelSize * vec2(0.0, 0.0), compare, near, far);
  float lt = texture2DCompare(depths, centroidUV + texelSize * vec2(0.0, 1.0), compare, near, far);
  float rb = texture2DCompare(depths, centroidUV + texelSize * vec2(1.0, 0.0), compare, near, far);
  float rt = texture2DCompare(depths, centroidUV + texelSize * vec2(1.0, 1.0), compare, near, far);
  float a = mix(lb, lt, f.y);
  float b = mix(rb, rt, f.y);
  float c = mix(a, b, f.x);

  return c;
}

float PCF3x3(sampler2D depths, vec2 size, vec2 uv, float compare, float near, float far) {
  float result = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 off = vec2(x, y) / float(size);
      result += texture2DShadowLerp(depths, size, uv + off, compare, near, far);
    }
  }
  return result / 9.0;
}

float PCF5x5(sampler2D depths, vec2 size, vec2 uv, float compare, float near, float far) {
  float result = 0.0;
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      vec2 off = vec2(x, y) / float(size);
      result += texture2DShadowLerp(depths, size, uv + off, compare, near, far);
    }
  }
  return result / 25.0;
}
`;

const PCFCube = /* glsl */ `
float textureCubeCompare(samplerCube depths, vec3 direction, float compare) {
  float depth = unpackDepth(textureCube(depths, direction)) * DEPTH_PACK_FAR;
  if (depth >= DEPTH_PACK_FAR - DEPTH_TOLERANCE) return 1.0;
  return step(compare, depth);
}

#if (__VERSION__ < 300)
  // Non optimised:
  float PCFCube(samplerCube depths, vec2 size, vec3 direction, float compare) {
    float result = 0.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 off = vec3(x, y, z) / float(size);
          result += textureCubeCompare(depths, direction + off, compare);
        }
      }
    }
    return result /= 27.0;
  }
#else
  // https://learnopengl.com/Advanced-Lighting/Shadows/Point-Shadows
  vec3 sampleOffsetDirections[20] = vec3[](
    vec3( 1,  1,  1), vec3( 1, -1,  1), vec3(-1, -1,  1), vec3(-1,  1,  1),
    vec3( 1,  1, -1), vec3( 1, -1, -1), vec3(-1, -1, -1), vec3(-1,  1, -1),
    vec3( 1,  1,  0), vec3( 1, -1,  0), vec3(-1, -1,  0), vec3(-1,  1,  0),
    vec3( 1,  0,  1), vec3(-1,  0,  1), vec3( 1,  0, -1), vec3(-1,  0, -1),
    vec3( 0,  1,  1), vec3( 0, -1,  1), vec3( 0, -1, -1), vec3( 0,  1, -1)
  );

  float PCFCube(samplerCube depths, vec2 size, vec3 direction, float compare) {
    float result = 0.0;

    for (int i = 0; i < 20; i++) {
      result += textureCubeCompare(depths, direction + sampleOffsetDirections[i] / float(size), compare);
    }

    return result /= 20.0;
  }
#endif
`;

export { PCF, PCFCube };
