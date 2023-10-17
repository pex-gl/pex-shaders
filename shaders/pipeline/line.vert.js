import SHADERS from "../chunks/index.js";

export default /* glsl */ `
${SHADERS.output.vert}

attribute vec3 aPosition;
attribute vec3 aPointA;
attribute vec3 aPointB;
attribute vec4 aColorA;
attribute vec4 aColorB;

#ifdef USE_INSTANCED_LINE_WIDTH
attribute vec2 aLineWidth;
#endif

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;

uniform float uLineWidth;
uniform vec2 uResolution;

varying vec4 vColor;

#define HOOK_VERT_DECLARATIONS_END

void main() {
  vColor = mix(aColorA, aColorB, aPosition.z);

  if (length(aPointA) == 0.0 || length(aPointB) == 0.0) {
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    vec4 positionViewA = uViewMatrix * uModelMatrix * vec4(aPointA, 1.0);
    vec4 positionViewB = uViewMatrix * uModelMatrix * vec4(aPointB, 1.0);

    vec4 clip0 = uProjectionMatrix * positionViewA;
    vec4 clip1 = uProjectionMatrix * positionViewB;

    vec2 screen0 = uResolution * (0.5 * clip0.xy / clip0.w + 0.5);
    vec2 screen1 = uResolution * (0.5 * clip1.xy / clip1.w + 0.5);

    vec2 xBasis = normalize(screen1 - screen0);
    vec2 yBasis = vec2(-xBasis.y, xBasis.x);

    vec2 width = uLineWidth * (aPosition.x * xBasis + aPosition.y * yBasis);

    #ifdef USE_INSTANCED_LINE_WIDTH
      width *= aLineWidth;
    #endif

    // TODO: it is still resolution dependent
    vec2 pt0 = screen0 + (aColorA.a * width) / -positionViewA.z;
    vec2 pt1 = screen1 + (aColorB.a * width) / -positionViewB.z;
    vec2 pt = mix(pt0, pt1, aPosition.z);
    vec4 clip = mix(clip0, clip1, aPosition.z);

    gl_Position = vec4(clip.w * ((2.0 * pt) / uResolution - 1.0), clip.z, clip.w);
  }

  #define HOOK_VERT_END
}
`;