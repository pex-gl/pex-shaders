import SHADERS from "../chunks/index.js";

export default /* glsl */ `
${SHADERS.output.vert}

attribute vec2 aPosition;

uniform vec3 uSunPosition;
uniform vec4 uParameters; // turbidity, rayleigh, mieCoefficient, mieDirectionalG

varying vec2 vTexCoord0;

varying vec3 vSunDirection;
varying float vSunfade;
varying float vSunE;
varying vec3 vBetaR;
varying vec3 vBetaM;

// const float turbidity = 10.0; // a measure of the fraction of scattering due to haze as opposed to molecules.
// const float rayleigh = 2.0; // scattering by air molecules
// const float mieCoefficient = 0.005; // non-molecular scattering or aerosol particle scattering

// constants for atmospheric scattering
const float e = 2.71828182845904523536028747135266249775724709369995957;

// const float n = 1.0003; // refractive index of air
// const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)
// const float pn = 0.035; // depolatization factor for standard air

// wavelength of used primaries, according to preetham
const vec3 lambda = vec3(680E-9, 550E-9, 450E-9);

// mie stuff
// K coefficient for the primaries
const vec3 K = vec3(0.686, 0.678, 0.666);
const float v = 4.0;

const vec3 up = vec3(0.0, 1.0, 0.0);

const float EE = 1000.0;
// 66 arc seconds -> degrees, and the cosine of that

// earth shadow hack
const float cutoffAngle = 1.6110731556870734; // pi/1.95;
const float steepness = 1.5;

const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);

// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn));
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);

// A simplied version of the total Reayleigh scattering to works on browsers that use ANGLE
// const vec3 simplifiedRayleigh = 0.0005 / vec3(94, 40, 18);

// float sunIntensity(float zenithAngleCos) {
//   return EE * max(0.0, 1.0 - exp(-((cutoffAngle - acos(zenithAngleCos)) / steepness)));
// }
float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}

vec3 totalMie(float T) {
  float c = (0.2 * T) * 10E-18;
  return 0.434 * c * MieConst;
}

void main() {
  vSunDirection = normalize(uSunPosition);
  vSunfade = 1.0 - clamp(1.0 - exp((uSunPosition.y / 450000.0)), 0.0, 1.0);
  vSunE = sunIntensity(dot(vSunDirection, up));

  float rayleighCoefficient = uParameters.y - (1.0 * (1.0 - vSunfade));
  // extinction (absorbtion + out scattering)
  // rayleigh coefficients
  vBetaR = totalRayleigh * rayleighCoefficient;
  // vBetaR = simplifiedRayleigh * rayleighCoefficient;

  // mie coefficients
  vBetaM = totalMie(uParameters.x) * uParameters.z;
  // vec3 betaM = totalMie(turbidity) * mieCoefficient;

  gl_Position = vec4(aPosition, 0.0, 1.0);
  vTexCoord0 = aPosition * 0.5 + 0.5;
}
`;
