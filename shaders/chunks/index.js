/** @module chunks */

/**
 * @type {object}
 * @name math
 * @static
 */
export * as math from "./math.js";
export * as noise from "./noise.js";

export {
  /** @member {string} */
  default as encodeDecode,
} from "./encode-decode.js";
export {
  /** @member {string} */
  default as luma,
} from "./luma.js";
export {
  /** @member {string} */
  default as luminance,
} from "./luminance.js";
export {
  /** @member {string} */
  default as average,
} from "./average.js";

export {
  /** @member {string} */
  default as lightAmbient,
} from "./light-ambient.js";
export {
  /** @member {string} */
  default as lightDirectional,
} from "./light-directional.js";
export {
  /** @member {string} */
  default as lightPoint,
} from "./light-point.js";
export {
  /** @member {string} */
  default as lightSpot,
} from "./light-spot.js";
export {
  /** @member {string} */
  default as lightArea,
} from "./light-area.js";
export {
  /** @member {string} */
  default as shadowing,
} from "./shadowing.js";

export {
  /** @member {string} */
  default as brdf,
} from "./brdf.js";
export {
  /** @member {string} */
  default as direct,
} from "./direct.js";
export {
  /** @member {string} */
  default as indirect,
} from "./indirect.js";

export {
  /** @member {string} */
  default as envMapEquirect,
} from "./env-map-equirect.js";
export {
  /** @member {string} */
  default as octMap,
} from "./oct-map.js";
export {
  /** @member {string} */
  default as octMapUvToDir,
} from "./oct-map-uv-to-dir.js";
export {
  /** @member {string} */
  default as irradiance,
} from "./irradiance.js";

export {
  /** @member {string} */
  default as textureCoordinates,
} from "./texture-coordinates.js";

export {
  /** @member {string} */
  default as baseColor,
} from "./base-color.js";
export {
  /** @member {string} */
  default as emissiveColor,
} from "./emissive-color.js";
export {
  /** @member {string} */
  default as normal,
} from "./normal.js";
export {
  /** @member {string} */
  default as normalPerturb,
} from "./normal-perturb.js";
export {
  /** @member {string} */
  default as metallicRoughness,
} from "./metallic-roughness.js";
export {
  /** @member {string} */
  default as specular,
} from "./specular.js";
export {
  /** @member {string} */
  default as specularGlossiness,
} from "./specular-glossiness.js";
export {
  /** @member {string} */
  default as clearCoat,
} from "./clear-coat.js";
export {
  /** @member {string} */
  default as sheenColor,
} from "./sheen-color.js";
export {
  /** @member {string} */
  default as transmission,
} from "./transmission.js";
export {
  /** @member {string} */
  default as alpha,
} from "./alpha.js";
export {
  /** @member {string} */
  default as ambientOcclusion,
} from "./ambient-occlusion.js";

export {
  /** @member {string} */
  default as depthRead,
} from "./depth-read.js";
export {
  /** @member {string} */
  default as depthPosition,
} from "./depth-position.js";
export {
  /** @member {string} */
  default as depthUnpack,
} from "./depth-unpack.js";
export {
  /** @member {string} */
  default as depthPack,
} from "./depth-pack.js";

export { default as fog } from "./fog.js";
export { default as fxaa } from "./fxaa.js";
export { default as filmGrain } from "./film-grain.js";
export {
  /** @member {string} */
  default as lut,
} from "./lut.js";
export { default as colorCorrection } from "./color-correction.js";
export {
  /** @member {string} */
  default as vignette,
} from "./vignette.js";

export { default as reversibleToneMap } from "./reversible-tone-map.js";
