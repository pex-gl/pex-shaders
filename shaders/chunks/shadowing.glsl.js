import { PCF, PCFCube } from "./pcf.glsl.js";
import { PCSSCommon, PCSS, PCSSCube } from "./pcss.glsl.js";

export default /* glsl */ `
#if NUM_DIRECTIONAL_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 || NUM_AREA_LIGHTS > 0 || NUM_POINT_LIGHTS > 0
  const float DEPTH_TOLERANCE = 0.001;
  ${PCSSCommon}
#endif

#if NUM_DIRECTIONAL_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 || NUM_AREA_LIGHTS > 0
  ${PCF}
  ${PCSS}

  float getShadow(sampler2D depths, vec2 size, vec2 uv, float compare, float near, float far, float ndcLightZ, vec2 radiusUV) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
      return 1.0;
    }
    #if SHADOW_QUALITY == 0
      return 1.0;
    #endif
    #if SHADOW_QUALITY == 1
      return texture2DCompare(depths, uv, compare, near, far);
    #endif
    #if SHADOW_QUALITY == 2
      return texture2DShadowLerp(depths, size, uv, compare, near, far);
    #endif
    #if SHADOW_QUALITY == 3
      return PCF3x3(depths, size, uv, compare, near, far);
    #endif
    #if SHADOW_QUALITY == 4
      return PCF5x5(depths, size, uv, compare, near, far);
    #endif
    #if SHADOW_QUALITY == 5
      return PCSS(depths, size, uv, compare, near, far, ndcLightZ, radiusUV);
    #endif
  }
#endif

#if NUM_POINT_LIGHTS > 0
  ${PCFCube}
  ${PCSSCube}

  float getPunctualShadow(samplerCube depths, vec2 size, vec3 direction, float compare, float radius) {
    #if SHADOW_QUALITY == 0
      return 1.0;
    #endif
    #if SHADOW_QUALITY == 1 || SHADOW_QUALITY == 2
      return textureCubeCompare(depths, direction, compare);
    #endif
    #if SHADOW_QUALITY == 3 || SHADOW_QUALITY == 4
      return PCFCube(depths, size, direction, compare);
    #endif
    #if SHADOW_QUALITY == 5
      return PCSSCube(depths, size, direction, compare, radius);
    #endif
  }
#endif
`;
