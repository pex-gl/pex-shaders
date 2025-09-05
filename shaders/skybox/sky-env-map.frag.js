import * as glslToneMap from "glsl-tone-map";

import * as SHADERS from "../chunks/index.js";

/**
 * Sky
 *
 * Based on "A Practical Analytic Model for Daylight" aka The Preetham Model, the de facto standard analytic skydome model
 *
 * Paper: https://www.researchgate.net/publication/220720443_A_Practical_Analytic_Model_for_Daylight
 *
 * Reference Implementation:
 * - First implemented by Simon Wallner http://www.simonwallner.at/projects/atmospheric-scattering
 * - Improved by Martins Upitis http://blenderartists.org/forum/showthread.php?245954-preethams-sky-impementation-HDR
 * - Three.js integration by zz85 http://twitter.com/blurspline
 *
 * Updates: Marcin Ignac http://twitter.com/marcinignac (2015-09) and Damien Seguin (2023-10)
 * @alias module:skybox.skyEnvMap.frag
 * @type {string}
 */
export default /* glsl */ `
#if (__VERSION__ < 300)
  #ifdef USE_DRAW_BUFFERS
    #extension GL_EXT_draw_buffers : enable
  #endif
#endif

precision highp float;

${SHADERS.output.frag}

uniform int uOutputEncoding;
uniform vec4 uParameters; // turbidity, rayleigh, mieCoefficient, mieDirectionalG

varying vec3 vSunDirection;
varying float vSunfade;
varying float vSunE;
varying vec3 vBetaR;
varying vec3 vBetaM;

varying vec2 vTexCoord0;

${SHADERS.math.PI}
${SHADERS.math.TWO_PI}
${SHADERS.math.saturate}
${SHADERS.encodeDecode}
${Object.values(glslToneMap).join("\n")}
${SHADERS.math.max3}
${SHADERS.reversibleToneMap}
#ifndef TONE_MAP
  #define TONE_MAP aces
#endif

// const float mieDirectionalG = 0.8;

// const float pi = 3.141592653589793238462643383279502884197169;

// optical length at zenith for molecules
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;

const vec3 up = vec3(0.0, 1.0, 0.0);

const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

// 3.0 / (16.0 * pi)
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;

float rayleighPhase(float cosTheta) {
  return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));
}

// 1.0 / (4.0 * pi)
const float ONE_OVER_FOURPI = 0.07957747154594767;

float hgPhase(float cosTheta, float g) {
  float g2 = pow(g, 2.0);
  return ONE_OVER_FOURPI * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5));
}

vec3 sky(vec3 worldNormal) {
  vec3 direction = normalize(worldNormal); // vWorldPosition - cameraPos

  // optical length
  // cutoff angle at 90 to avoid singularity in next formula.
  float zenithAngle = acos(max(0.0, dot(up, direction)));
  float divider = (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / PI), -1.253));
  float sR = rayleighZenithLength / divider;
  float sM = mieZenithLength / divider;

  // combined extinction factor
  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));

  // in scattering
  float cosTheta = dot(direction, vSunDirection);

  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaRTheta = vBetaR * rPhase;

  float mPhase = hgPhase(cosTheta, uParameters.w);
  // float mPhase = hgPhase(cosTheta, mieDirectionalG);
  vec3 betaMTheta = vBetaM * mPhase;

  vec3 LinFactor = vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM));
  vec3 Lin = pow(LinFactor * (1.0 - Fex), vec3(1.5));
  Lin *= mix(
    vec3(1.0),
    pow(LinFactor * Fex, vec3(1.0 / 2.0)),
    saturate(pow(1.0 - dot(up, vSunDirection), 5.0))
  );

  // nightsky
  float theta = acos(direction.y); // elevation --> y-axis, [-pi/2, pi/2]
  float phi = atan(direction.z, direction.x); // azimuth --> x-axis [-pi/2, pi/2]
  vec2 uv = vec2(phi, theta) / vec2(TWO_PI, PI) + vec2(0.5, 0.0);
  // vec3 L0 = texture2D(skySampler, uv).rgb+0.1 * Fex;
  vec3 L0 = vec3(0.1) * Fex;

  // composition + solar disc
  // if (cosTheta > sunAngularDiameterCos)
  float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
  // if (normalize(vWorldPosition - cameraPos).y>0.0)
  L0 += (vSunE * 19000.0 * Fex) * sundisk;

  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);

  return pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade))));
}

void main() {
  vec4 color = vec4(0.0);

  // Texture coordinates to normal:
  // https://web.archive.org/web/20170606085139/http://gl.ict.usc.edu/Data/HighResProbes/
  // u=[0,2], v=[0,1],
  // theta=pi*(u-1), phi=pi*v
  // (Dx,Dy,Dz) = (sin(phi)*sin(theta), cos(phi), -sin(phi)*cos(theta)).

  float theta = PI * (vTexCoord0.x * 2.0 - 1.0);
  float phi = PI * (1.0 - vTexCoord0.y);

  color.rgb = sky(vec3(sin(phi) * sin(theta), cos(phi), -sin(phi) * cos(theta)));
  color.rgb = TONE_MAP(color.rgb);
  color.rgb = toLinear(color.rgb);

  color.a = 1.0;

  gl_FragData[0] = encode(color, uOutputEncoding);

  #ifdef USE_DRAW_BUFFERS
    #if LOCATION_NORMAL >= 0
      gl_FragData[LOCATION_NORMAL] = vec4(0.0, 0.0, 1.0, 1.0);
    #endif
    #if LOCATION_EMISSIVE >= 0
      gl_FragData[LOCATION_EMISSIVE] = vec4(0.0);
    #endif
    #if LOCATION_VELOCITY >= 0
      gl_FragData[LOCATION_VELOCITY] = vec4(0.5, 0.5, 0.5, 1.0);
    #endif
  #endif

  ${SHADERS.output.assignment}
}
`;
