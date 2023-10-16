import SHADERS from "../chunks/index.js";

export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

uniform int uOutputEncoding;
uniform vec3 uSunPosition;

varying vec2 vTexCoord0;

${SHADERS.math.PI}
${SHADERS.sky}
${SHADERS.rgbm}
${SHADERS.gamma}
${SHADERS.encodeDecode}
${SHADERS.tonemapUncharted2}

void main() {
  vec4 color = vec4(0.0);

  //Texture coordinates to Normal is Based on
  //http://gl.ict.usc.edu/Data/HighResProbes/
  // u=[0,2], v=[0,1],
  // theta=pi*(u-1), phi=pi*v
  // (Dx,Dy,Dz) = (sin(phi)*sin(theta), cos(phi), -sin(phi)*cos(theta)).

  float u = vTexCoord0.x;
  float v = 1.0 - vTexCoord0.y; // uv's a Y flipped in WebGL

  float theta = PI * (u * 2.0 - 1.0);
  float phi = PI * v;

  vec3 N = vec3(
    sin(phi) * sin(theta),
    cos(phi),
    -sin(phi) * cos(theta)
  );

  color.rgb = sky(uSunPosition, N);
  color.rgb = tonemapUncharted2(color.rgb);
  color.rgb = toLinear(color.rgb);
  color.a = 1.0;

  gl_FragData[0] = encode(color, uOutputEncoding);

  #ifdef USE_DRAW_BUFFERS
    #if LOCATION_NORMAL >= 0
      gl_FragData[LOCATION_NORMAL] = vec4(0.0);
    #endif
    #if LOCATION_EMISSIVE >= 0
      gl_FragData[LOCATION_EMISSIVE] = vec4(0.0);
    #endif
  #endif

  ${SHADERS.output.assignment}
}
`;
