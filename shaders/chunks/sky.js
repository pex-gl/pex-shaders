/**
 * Sky
 *
 * Based on "A Practical Analytic Model for Daylight" aka The Preetham Model,
 * the de facto standard analytic skydome model
 *
 * Paper:
 * https://www.researchgate.net/publication/220720443_A_Practical_Analytic_Model_for_Daylight
 *
 * Reference Implementation:
 *
 * - First implemented by Simon Wallner
 *   http://www.simonwallner.at/projects/atmospheric-scattering
 * - Improved by Martins Upitis
 *   http://blenderartists.org/forum/showthread.php?245954-preethams-sky-impementation-HDR
 * - Three.js integration by zz85 http://twitter.com/blurspline
 *
 * Updates: Marcin Ignac http://twitter.com/marcinignac (2015-09) and Damien
 * Seguin (2023-10)
 *
 * @type {string}
 * @alias module:chunks.sky
 */
export default /* wgsl */ `
struct SkyData {
  sunDirection: vec3f,
  sunfade: f32,
  sunE: f32,
  betaR: vec3f,
  betaM: vec3f,
  mieDirectionalG: f32,
}

const skyUp: vec3f = vec3f(0.0, 1.0, 0.0);

const skyE: f32 = 2.71828182845904523536028747135266249775724709369995957;

const EE: f32 = 1000.0;

// earth shadow hack
const cutoffAngle: f32 = 1.6110731556870734; // pi/1.95
const steepness: f32 = 1.5;

// mie coefficients for the primaries
const MieConst: vec3f = vec3f(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);

// rayleigh coefficients for the primaries
const totalRayleighConst: vec3f = vec3f(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);

fn sunIntensity(zenithAngleCosIn: f32) -> f32 {
  let zenithAngleCos = clamp(zenithAngleCosIn, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(skyE, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}

fn totalMie(T: f32) -> vec3f {
  let c = (0.2 * T) * 10E-18;
  return 0.434 * c * MieConst;
}

fn skyVertex(sunPosition: vec3f, parameters: vec4f) -> SkyData {
  var sky: SkyData;

  sky.sunDirection = normalize(sunPosition);
  sky.sunfade = 1.0 - saturateF32(1.0 - exp(sunPosition.y / 450000.0));
  sky.sunE = sunIntensity(dot(sky.sunDirection, skyUp));

  // extinction (absorbtion + out scattering)
  let rayleighCoefficient = parameters.y - (1.0 * (1.0 - sky.sunfade));
  sky.betaR = totalRayleighConst * rayleighCoefficient;
  sky.betaM = totalMie(parameters.x) * parameters.z;
  sky.mieDirectionalG = parameters.w;

  return sky;
}

// optical length at zenith for molecules
const rayleighZenithLength: f32 = 8.4E3;
const mieZenithLength: f32 = 1.25E3;

const sunAngularDiameterCos: f32 = 0.999956676946448443553574619906976478926848692873900859324;

// 3.0 / (16.0 * pi)
const THREE_OVER_SIXTEENPI: f32 = 0.05968310365946075;

fn rayleighPhase(cosTheta: f32) -> f32 {
  return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));
}

// 1.0 / (4.0 * pi)
const ONE_OVER_FOURPI: f32 = 0.07957747154594767;

fn hgPhase(cosTheta: f32, g: f32) -> f32 {
  let g2 = pow(g, 2.0);
  return ONE_OVER_FOURPI * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5));
}

fn skyFrag(directionIn: vec3f, sky: SkyData) -> vec3f {
  let direction = normalize(directionIn);

  // optical length
  // cutoff angle at 90 to avoid singularity in next formula.
  let zenithAngle = acos(max(0.0, dot(skyUp, direction)));
  let divider = cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / PI), -1.253);
  let sR = rayleighZenithLength / divider;
  let sM = mieZenithLength / divider;

  // combined extinction factor
  let Fex = exp(-(sky.betaR * sR + sky.betaM * sM));

  // in scattering
  let cosTheta = dot(direction, sky.sunDirection);

  let rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  let betaRTheta = sky.betaR * rPhase;

  let mPhase = hgPhase(cosTheta, sky.mieDirectionalG);
  let betaMTheta = sky.betaM * mPhase;

  let LinFactor = sky.sunE * ((betaRTheta + betaMTheta) / (sky.betaR + sky.betaM));
  var Lin = pow(LinFactor * (1.0 - Fex), vec3f(1.5));
  Lin *= mix(
    vec3f(1.0),
    pow(LinFactor * Fex, vec3f(1.0 / 2.0)),
    saturateF32(pow(1.0 - dot(skyUp, sky.sunDirection), 5.0))
  );

  let L0 = vec3f(0.1) * Fex;

  // composition + solar disc
  let sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
  let L0Sun = L0 + (sky.sunE * 19000.0 * Fex) * sundisk;

  return (Lin + L0Sun) * 0.04 + vec3f(0.0, 0.0003, 0.00075);
}
`;
