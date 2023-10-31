import * as SHADERS from "../chunks/index.js";

export default /* glsl */ `
${SHADERS.output.vert}

// Variables
attribute vec3 aPosition;

#ifdef USE_INSTANCED_OFFSET
attribute vec3 aOffset;
#endif

#ifdef USE_INSTANCED_SCALE
attribute vec3 aScale;
#endif

#ifdef USE_INSTANCED_ROTATION
attribute vec4 aRotation;
#endif

#ifdef USE_INSTANCED_COLOR
attribute vec4 aColor;
#endif

#ifdef USE_VERTEX_COLORS
attribute vec4 aVertexColor;
#endif

#if defined(USE_VERTEX_COLORS) || defined(USE_INSTANCED_COLOR)
varying vec4 vColor;
#endif

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;

// Includes
${SHADERS.math.transposeMat4}
${SHADERS.math.quatToMat4}

#define HOOK_VERT_DECLARATIONS_END

void main() {
  vec4 position = vec4(aPosition, 1.0);

  #define HOOK_VERT_BEFORE_TRANSFORM

  #ifdef USE_INSTANCED_SCALE
    position.xyz *= aScale;
  #endif

  #ifdef USE_INSTANCED_ROTATION
    mat4 rotationMat = quatToMat4(aRotation);
    position = rotationMat * position;
  #endif

  #ifdef USE_INSTANCED_OFFSET
    position.xyz += aOffset;
  #endif

  vec4 positionWorld = uModelMatrix * position;

#if defined(USE_VERTEX_COLORS) && defined(USE_INSTANCED_COLOR)
  vColor = aVertexColor * aColor;
#else
  #ifdef USE_INSTANCED_COLOR
    vColor = aColor;
  #endif

  #ifdef USE_VERTEX_COLORS
    vColor = aVertexColor;
  #endif
#endif

  vec4 positionView = uViewMatrix * positionWorld;
  vec4 positionOut = uProjectionMatrix * positionView;

  gl_Position = positionOut;

  #define HOOK_VERT_END
}
`;
