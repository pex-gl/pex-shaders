import * as SHADERS from "../chunks/index.js";

/**
 * DoF (Depth of Field)
 *
 * Based on:
 * - "Bokeh depth of field in a single pass", Dennis Gustafsson: https://blog.voxagon.se/2018/05/04/bokeh-depth-of-field-in-single-pass.html
 * - "GLSL depth of field with bokeh v2.4", Martins Upitis: https://devlog-martinsh.blogspot.com/2011/12/glsl-depth-of-field-with-bokeh-v24.html
 * @alias module:postProcessing.dof.frag
 * @type {string}
 */
export default /* glsl */ `
precision highp float;

// Required defines:
// USE_DOF_GUSTAFSSON or USE_DOF_UPITIS
// NUM_SAMPLES 6

// Optional defines:
// USE_PHYSICAL
// USE_FOCUS_ON_SCREEN_POINT
// USE_DEBUG
// USE_SHAPE_PENTAGON

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform sampler2D uDepthTexture;
uniform vec2 uViewportSize;
uniform vec2 uTexelSize;

uniform float uNear;
uniform float uFar;
uniform float uFocusScale; // Non physically based value

#ifdef USE_PHYSICAL
  uniform float uFStop;
  uniform float uFocalLength;
#endif

uniform float uChromaticAberration;
uniform float uLuminanceThreshold;
uniform float uLuminanceGain;

#ifdef USE_FOCUS_ON_SCREEN_POINT
  uniform vec2 uScreenPoint;
#else
  uniform float uFocusDistance;
#endif

varying vec2 vTexCoord0;

// Use a default circle of confusion for simplicity sake instead of sensor dimensions
// 35mm film has a 24x36mm frame size which result in (43mm diagonal / 1500 enlargement of sensor size) = 0.029mm CoC
const float CoC = 0.029;

// Includes
${SHADERS.luma}
${SHADERS.depthRead}
${SHADERS.math.saturate}
#ifdef USE_DOF_UPITIS
  ${SHADERS.math.TWO_PI}
  ${SHADERS.math.random}
#endif

// Apply chromatic aberration
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

float getCoC(float depth, float focusDistance, float focusScale) {
  #ifdef USE_PHYSICAL
    float plane = (depth * uFocalLength) / (depth - uFocalLength);
    float far = (focusDistance * uFocalLength) / (focusDistance - uFocalLength);
    float near = (focusDistance - uFocalLength) / (focusDistance * uFStop * focusScale * CoC); // focusScale !== 1.0 makes it non-physical
    return saturate(abs(plane - far) * near);
  #else
    float coc = clamp((1.0 / focusDistance - 1.0 / depth) * focusScale, -1.0, 1.0); // (1 / mm - 1 / mm) * mm = mm
    return abs(coc);
  #endif
}

#ifdef USE_DEBUG
  vec3 dofDebug(vec2 texCoord, float focusDistance, float blur, float focusScale) {
    if (texCoord.x > 0.90) {
      float cameraDepth = (uFar - uNear) * 1000.0; // m -> mm
      float depth = texCoord.y * cameraDepth; // uv * mm = mm

      // CoC
      if (texCoord.x <= 0.95) {
        float t = (texCoord.x - 0.9) * 20.0;
        float coc = getCoC(depth, focusDistance, focusScale);
        if (coc > t) return vec3(1.0);
        return vec3(0.0);
      }

      // Focus distance
      if (texCoord.x > 0.97) {
        // Relative to camera depth (using 2.5% of camera depth)
        if (abs(depth - focusDistance) < cameraDepth * 0.0025) return vec3(1.0, 1.0, 0.0);
        return vec3(floor(texCoord.y * 10.0)) / 10.0;
      }

      // Focal length and f-stop
      #ifdef USE_PHYSICAL
        float H = uFocalLength * uFocalLength / (uFStop * CoC); //mm
      #else
        float H = focusScale;
      #endif
      float near = H * focusDistance / (H + focusDistance);
      float far = H * focusDistance / (H - focusDistance);

      if (abs(depth - H) < cameraDepth * 0.0025) return vec3(1.0, 1.0, 0.0); // ?
      if (depth < near) return vec3(1.0, 0.0, 0.0); // Foreground
      if (depth > far) return vec3(0.0, 0.0, 1.0); // Background

      return vec3(0.0, 1.0, 0.0);
    }
    // Blur amount in scene
    return vec3(floor(abs(blur) / 0.1 * 100.0) / 100.0, 0.0, 0.0);
  }
#endif

// Gustafsson
#ifdef USE_DOF_GUSTAFSSON
  const float GOLDEN_ANGLE = 2.39996323;  // rad
  const float MAX_BLUR_SIZE = 30.0;
  const float RAD_SCALE = 0.5; // Smaller = nicer blur, larger = faster

  vec3 depthOfFieldGustafsson(vec2 texCoord, float focusDistance, float centerSize, float focusScale, float centerDepth) {
    #ifdef USE_DEBUG
      if (texCoord.x > 0.5) return dofDebug(vTexCoord0, focusDistance, centerSize, focusScale);
    #endif

    // Get blur size
    centerSize *= MAX_BLUR_SIZE;

    vec3 color = texture2D(uTexture, texCoord).rgb;
    float tot = 1.0;
    float radius = RAD_SCALE;

    // Heuristic to make DoF resolution independent
    float resolutionScale = pow(uViewportSize.y / 1080.0, 2.0);
    float maxRadius = MAX_BLUR_SIZE * resolutionScale;

    for (float ang = 0.0; ang < maxRadius * float(NUM_SAMPLES); ang += GOLDEN_ANGLE) {
      vec2 tc = texCoord + vec2(cos(ang), sin(ang)) * uTexelSize * radius;

      float sampleDepth = readDepth(uDepthTexture, tc, uNear, uFar) * 1000.0; // m -> mm;
      float sampleSize = getCoC(sampleDepth, focusDistance, focusScale) * MAX_BLUR_SIZE; // mm

      if (sampleDepth > centerDepth) {
        // Controls how much of the background gets blended into a blurry foreground
        // Unphysical, to approximate the occluded information behind the foreground object
        sampleSize = clamp(sampleSize, 0.0, centerSize * 2.0);
      }

      float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);

      color += mix(color / tot, processSample(tc, m, uTexelSize), m);
      tot += 1.0;

      radius += RAD_SCALE / radius * resolutionScale;

      if (radius > maxRadius) break;
    }
    return color /= tot;
  }
#endif

// Upitis
#ifdef USE_DOF_UPITIS
  const int RINGS = 4; //ring count
  const int MAX_RING_SAMPLES = RINGS * NUM_SAMPLES;

  float maxBlur = 1.0;
  float bias = 0.5; // bokeh edge bias
  float namount = 0.0001; //dither amount

  #ifdef USE_SHAPE_PENTAGON
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

      return saturate(inorout);
    }
  #endif

  vec3 depthOfFieldUpitis(vec2 texCoord, float focusDistance, float blur, float focusScale) {
    #ifdef USE_DEBUG
      if (texCoord.x > 0.5) return dofDebug(vTexCoord0, focusDistance, blur, focusScale);
    #endif

    vec3 color = texture2D(uTexture, texCoord).rgb;

    if (blur >= 0.05) {
      vec2 noise =
        (vec2(rand(texCoord.xy), rand(texCoord.xy * 2.0)) * vec2(2.0) - vec2(1.0)) *
        namount *
        blur;
      vec2 blurFactor = uTexelSize * blur * maxBlur + noise;

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
          vec2 pwh = vec2(
            cos(jFloat * step) * iFloat,
            sin(jFloat * step) * iFloat
          );

          #ifdef USE_SHAPE_PENTAGON
            float p = pentagon(pwh, ringFloat);
          #else
            float p = 1.0;
          #endif

          float m = mix(1.0, iFloat / ringFloat, bias) * p;
          color += processSample(texCoord + pwh * blurFactor, blur, uTexelSize) * m;
          s += m;
        }
      }

      color /= s;
    }

    return color;
  }
#endif

void main () {
  #ifdef USE_FOCUS_ON_SCREEN_POINT
    float focusDistance = readDepth(uDepthTexture, uScreenPoint, uNear, uFar) * 1000.0; // m -> mm
  #else
    float focusDistance = uFocusDistance * 1000.0; // m -> mm
  #endif

  float centerDepth = readDepth(uDepthTexture, vTexCoord0, uNear, uFar) * 1000.0;

  #ifdef USE_PHYSICAL
    // Act as an fStop divider
    float focusScale = 1.0 / uFocusScale;
  #else
    // Heuristic for focus scale to be relative to height / 1024
    // TODO: should it aim to be close to camera physical default instead?
    float focusScale = (uFocusScale * uViewportSize.y) / 1024.0 * 1000.0; // mm
  #endif

  float centerSize = getCoC(centerDepth, focusDistance, focusScale); // mm

  #ifdef USE_DOF_GUSTAFSSON
    vec3 color = depthOfFieldGustafsson(vTexCoord0, focusDistance, centerSize, focusScale, centerDepth);
  #endif
  #ifdef USE_DOF_UPITIS
    vec3 color = depthOfFieldUpitis(vTexCoord0, focusDistance, centerSize, focusScale);
  #endif

  gl_FragColor = vec4(color, 1.0);

  ${SHADERS.output.assignment}
}
`;
