import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform sampler2D uDepthTexture;
uniform vec2 uViewportSize;
uniform vec2 uTexelSize;

uniform float uNear;
uniform float uFar;
uniform float uFStop;
uniform float uFocalLength;
uniform float uSensorHeight;

uniform float uChromaticAberration;
uniform float uLuminanceThreshold;
uniform float uLuminanceGain;

#ifdef USE_DOF_FOCUS_ON_SCREEN_POINT
  uniform vec2 uScreenPoint;
#else
  uniform float uFocusDistance;
#endif

varying vec2 vTexCoord0;

const float CoC = 0.03; // 35mm film = 0.03mm

// Includes
${SHADERS.math.TWO_PI}
${SHADERS.luma}
${SHADERS.depthRead}

vec3 processSample(vec2 coords, float blur, vec2 texelSize) {
  vec2 scale = texelSize * uChromaticAberration * blur;

  vec3 color = vec3(
    texture2D(uTexture, coords + vec2(0.0, 1.0) * scale).r,
    texture2D(uTexture, coords + vec2(-0.866, -0.5) * scale).g,
    texture2D(uTexture, coords + vec2(0.866, -0.5) * scale).b
  );

  float threshold = max((luma(color) - uLuminanceThreshold) * uLuminanceGain, 0.0);

  return color + mix(vec3(0.0), color, threshold * blur);
}

// Bokeh depth of field in a single pass
// https://blog.voxagon.se/2018/05/04/bokeh-depth-of-field-in-single-pass.html
const float GOLDEN_ANGLE = 2.39996323;  // rad
const float MAX_BLUR_SIZE = 30.0;
const float RAD_SCALE = 0.2; // Smaller = nicer blur, larger = faster

float getBlurSize(float depth, float focusDistance, float maxCoC) {
  float coc = clamp((1.0 - focusDistance / depth) * maxCoC, -1.0, 1.0); // (1 - mm/mm) * mm = mm
  return abs(coc) * MAX_BLUR_SIZE;
}

vec3 dofDebug(vec2 texCoord, float blur, float focusDistance, float focusScale) {
  if (texCoord.x > 0.90) {
    float depth = texCoord.y * 1000.0 * 100.0; //100m

    if (texCoord.x <= 0.95) {
      float t = (texCoord.x - 0.9) * 20.0;
      float coc = (1.0 - focusDistance / depth) * focusScale * 10.0;
      coc = abs(coc);
      if (coc > t) return vec3(1.0);
      return vec3(0.0);
    }

    if (texCoord.x > 0.97) {
      if (depth > focusDistance - 250.0 && depth < focusDistance + 250.0) {
        return vec3(1.0, 1.0, 0.0);
      }
      return vec3(floor(texCoord.y * 10.0)) / 10.0;
    }

    float c = CoC;
    float H = uFocalLength * uFocalLength / (uFStop * c); //mm
    float Dn = H * focusDistance / (H + focusDistance);
    float Df = H * focusDistance / (H - focusDistance);
    if (depth > H - 250.0 && depth < H + 250.0) return vec3(1.0, 1.0, 0.0);
    if (depth < Dn) return vec3(1.0, 0.0, 0.0);
    if (depth > Df) return vec3(1.0, 0.0, 0.0);

    return vec3(0.0, 1.0, 0.0);
  }
  return vec3(floor(abs(blur) / 0.1 * 100.0) / 100.0, 0.0, 0.0);
}

vec3 depthOfFieldGustafsson(vec2 texCoord, float focusDistance) {
  // Get maxCoC
  float F = uFocalLength;
  float A = F / uFStop;
  float focusScale = A * F / (focusDistance - F); // mm * mm / mm = mm

  float resolutionScale = uViewportSize.y / 1080.0; // pow(uViewportSize.y / 1080.0, 2.0);
  float centerDepth = readDepth(uDepthTexture, texCoord, uNear, uFar) * 1000.0; // m -> mm
  float centerSize = getBlurSize(centerDepth, focusDistance, focusScale); // mm

  #ifdef USE_DOF_DEBUG
    if (texCoord.x > 0.5) {
      float blur = centerSize / MAX_BLUR_SIZE;
      return dofDebug(texCoord, blur, focusDistance, focusScale);
    }
  #endif

  vec3 color = texture2D(uTexture, texCoord).rgb;
  float tot = 1.0;
  float radius = RAD_SCALE;

  for (float ang = 0.0; ang < MAX_BLUR_SIZE * float(NUM_SAMPLES); ang += GOLDEN_ANGLE) {
  // for (float ang = 0.0; ang < 180.0; ang += GOLDEN_ANGLE) {
    vec2 tc = texCoord + vec2(cos(ang), sin(ang)) * uTexelSize * radius;

    float sampleDepth = readDepth(uDepthTexture, tc, uNear, uFar) * 1000.0; // m -> mm;
    float sampleSize = getBlurSize(sampleDepth, focusDistance, focusScale); // mm
    if (sampleDepth > centerDepth) {
      sampleSize = clamp(sampleSize, 0.0, centerSize * 2.0);
    }

    float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);
    // color += mix(color / tot, texture2D(uTexture, tc).rgb, m);
    // tot += 1.0;

    // Apply chromatic aberration
    color += processSample(tc, m, uTexelSize) * m;
    tot += m;

    radius += RAD_SCALE / radius * resolutionScale;

    if (radius > MAX_BLUR_SIZE * resolutionScale) break;
  }
  return color /= tot;
}

// Martins Upitis
// https://devlog-martinsh.blogspot.com/2011/12/glsl-depth-of-field-with-bokeh-v24.html
const int RINGS = 4; //ring count
const int MAX_RING_SAMPLES = RINGS * NUM_SAMPLES;

float maxBlur = 1.0;
float bias = 0.5; // bokeh edge bias

#ifdef USE_DOF_SHAPE_PENTAGON
  float feather = 0.4; // pentagon shape feather

  float pentagon(vec2 coords, float rings) {
    float scale = rings - 1.3;
    vec4 HS0 = vec4( 1.0,         0.0,         0.0,  1.0);
    vec4 HS1 = vec4( 0.309016994, 0.951056516, 0.0,  1.0);
    vec4 HS2 = vec4(-0.809016994, 0.587785252, 0.0,  1.0);
    vec4 HS3 = vec4(-0.809016994,-0.587785252, 0.0,  1.0);
    vec4 HS4 = vec4( 0.309016994,-0.951056516, 0.0,  1.0);
    vec4 HS5 = vec4( 0.0        ,0.0         , 1.0,  1.0);

    vec4 one = vec4(1.0);

    vec4 P = vec4((coords),vec2(scale, scale));

    vec4 dist = vec4(0.0);
    float inorout = -4.0;

    dist.x = dot(P, HS0);
    dist.y = dot(P, HS1);
    dist.z = dot(P, HS2);
    dist.w = dot(P, HS3);

    dist = smoothstep(-feather, feather, dist);

    inorout += dot( dist, one );

    dist.x = dot(P, HS4);
    dist.y = HS5.w - abs(P.z);

    dist = smoothstep(-feather, feather, dist);
    inorout += dist.x;

    return clamp(inorout, 0.0, 1.0);
  }
#endif

vec3 depthOfFieldUpitis(vec2 texCoord, float focusDistance) {
  float centerDepth = readDepth(uDepthTexture, texCoord, uNear, uFar) * 1000.0;

  float plane = (centerDepth * uFocalLength) / (centerDepth - uFocalLength);
  float far = (focusDistance * uFocalLength) / (focusDistance - uFocalLength);
  float near = (focusDistance - uFocalLength) / (focusDistance * uFStop * CoC);

  float blur = abs(plane - far) * near;

  #ifdef USE_DOF_DEBUG
    if (texCoord.x > 0.5) {
      return dofDebug(texCoord, blur / 100.0, focusDistance, blur);
    }
  #endif

  blur = clamp(blur, 0.0, 1.0);
  vec3 color = texture2D(uTexture, texCoord).rgb;

  if (blur >= 0.05) {
    vec2 blurFactor = blur * maxBlur * uTexelSize;

    float s = 1.0;
    int ringSamples;
    float ringFloat = float(RINGS);

    for (int i = 1; i <= RINGS; i++) {
      ringSamples = i * NUM_SAMPLES;
      float iFloat = float(i);

      for (int j = 0; j < MAX_RING_SAMPLES; j++) {
        if (j >= ringSamples) break;
        float jFloat = float(j);
        float step = TWO_PI / float(ringSamples);
        vec2 wh = vec2(
          cos(jFloat * step) * iFloat,
          sin(jFloat * step) * iFloat
        );

        #ifdef USE_DOF_SHAPE_PENTAGON
          float p = pentagon(wh, ringFloat);
        #else
          float p = 1.0;
        #endif

        float m = mix(1.0, iFloat / ringFloat, bias) * p;
        color += processSample(texCoord + wh * blurFactor, blur, uTexelSize) * m;
        s += m;
      }
    }

    color /= s;
  }

  return color;
}

void main () {
  #ifdef USE_DOF_FOCUS_ON_SCREEN_POINT
    float focusDistance = readDepth(uDepthTexture, uScreenPoint, uNear, uFar) * 1000.0; // m -> mm
  #else
    float focusDistance = uFocusDistance * 1000.0; // m -> mm
  #endif

  #ifdef USE_DOF_GUSTAFSSON
    vec3 color = depthOfFieldGustafsson(vTexCoord0, focusDistance);
  #endif
  #ifdef USE_DOF_UPITIS
    vec3 color = depthOfFieldUpitis(vTexCoord0, focusDistance);
  #endif

  gl_FragColor = vec4(color, 1.0);

  ${SHADERS.output.assignment}
}
`;
