import * as SHADERS from "../chunks/index.js";

/**
 * @alias module:pipeline.depthPass.vert
 * @type {string}
 */
export default /* glsl */ `
${SHADERS.output.vert}

// Variables
attribute vec3 aPosition;

#ifdef USE_NORMALS
attribute vec3 aNormal;
#endif

#ifdef USE_TEXCOORD_0
attribute vec2 aTexCoord0;
#endif

#ifdef USE_TEXCOORD_1
attribute vec2 aTexCoord1;
#endif

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

#ifdef USE_SKIN
attribute vec4 aJoint;
attribute vec4 aWeight;
uniform mat4 uJointMat[NUM_JOINTS];
#endif

#ifdef USE_DISPLACEMENT_TEXTURE
uniform sampler2D uDisplacementTexture;
uniform float uDisplacement;
#endif

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
uniform mat3 uNormalMatrix;

uniform float uPointSize;

float uDisplacementShadowStretch = 1.3;

varying vec3 vNormalView;
varying vec2 vTexCoord0;
#ifdef USE_TEXCOORD_1
varying vec2 vTexCoord1;
#endif
varying vec3 vPositionView;

// Includes
${SHADERS.math.quatToMat4}

#define HOOK_VERT_DECLARATIONS_END

void main() {
  vec4 position = vec4(aPosition, 1.0);
  vec3 normal = vec3(0.0, 0.0, 0.0);
  vec2 texCoord = vec2(0.0, 0.0);
  vec4 positionView = vec4(0.0);

  #ifdef USE_NORMALS
    normal = aNormal;
  #endif

  #ifdef USE_TEXCOORD_0
    texCoord = aTexCoord0;
  #endif

  vTexCoord0 = texCoord;

  #ifdef USE_TEXCOORD_1
    vTexCoord1 = aTexCoord1;
  #endif

  #ifdef USE_INSTANCED_OFFSET
    vec3 offset = aOffset;
  #endif

  #ifdef USE_INSTANCED_SCALE
    vec3 scale = aScale;
  #endif

  #ifdef USE_INSTANCED_ROTATION
    vec4 rotation = aRotation;
  #endif

  #ifdef USE_INSTANCED_COLOR
    vec4 color = aColor;
  #endif

  #ifdef USE_VERTEX_COLORS
    vec4 vertexColor = aVertexColor;
  #endif

  #define HOOK_VERT_BEFORE_TRANSFORM

  #ifdef USE_DISPLACEMENT_TEXTURE
    float h = texture2D(uDisplacementTexture, aTexCoord0).r;
    position.xyz += uDisplacement * h * normal * uDisplacementShadowStretch;
  #endif

  #ifdef USE_INSTANCED_SCALE
    position.xyz *= scale;
  #endif

  #ifdef USE_INSTANCED_ROTATION
    mat4 rotationMat = quatToMat4(rotation);
    position = rotationMat * position;
    normal = vec3(rotationMat * vec4(normal, 0.0));
  #endif

  #ifdef USE_INSTANCED_OFFSET
    position.xyz += offset;
  #endif

  #if defined(USE_VERTEX_COLORS) && defined(USE_INSTANCED_COLOR)
    vColor = vertexColor * color;
  #else
    #ifdef USE_INSTANCED_COLOR
      vColor = color;
    #endif

    #ifdef USE_VERTEX_COLORS
      vColor = vertexColor;
    #endif
  #endif

  #ifdef USE_SKIN
    mat4 skinMat =
      aWeight.x * uJointMat[int(aJoint.x)] +
      aWeight.y * uJointMat[int(aJoint.y)] +
      aWeight.z * uJointMat[int(aJoint.z)] +
      aWeight.w * uJointMat[int(aJoint.w)];

    positionView = uViewMatrix * skinMat * position;
  #else
    positionView = uViewMatrix * uModelMatrix * position;
  #endif

  gl_Position = uProjectionMatrix * positionView;
  gl_PointSize = uPointSize;

  vPositionView = positionView.xyz;
  vNormalView = normalize(uNormalMatrix * normal);

  #define HOOK_VERT_END
}
`;
