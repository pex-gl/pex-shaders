/** @module chunks */

/**
 * @name output
 * @type {object}
 * @static
 */
export * as output from "./output.glsl.js";
/**
 * @name math
 * @type {object}
 * @static
 */
export * as math from "./math.glsl.js";
export * as noise from "./noise.glsl.js";

export {
  /** @member {string} */
  default as encodeDecode,
} from "./encode-decode.glsl.js";
export {
  /** @member {string} */
  default as luma,
} from "./luma.glsl.js";
export {
  /** @member {string} */
  default as luminance,
} from "./luminance.glsl.js";
export {
  /** @member {string} */
  default as average,
} from "./average.glsl.js";

export {
  /** @member {string} */
  default as lightAmbient,
} from "./light-ambient.glsl.js";
export {
  /** @member {string} */
  default as lightDirectional,
} from "./light-directional.glsl.js";
export {
  /** @member {string} */
  default as lightPoint,
} from "./light-point.glsl.js";
export {
  /** @member {string} */
  default as lightSpot,
} from "./light-spot.glsl.js";
export {
  /** @member {string} */
  default as lightArea,
} from "./light-area.glsl.js";
export {
  /** @member {string} */
  default as shadowing,
} from "./shadowing.glsl.js";

export {
  /** @member {string} */
  default as brdf,
} from "./brdf.glsl.js";
export {
  /** @member {string} */
  default as direct,
} from "./direct.glsl.js";
export {
  /** @member {string} */
  default as indirect,
} from "./indirect.glsl.js";

export {
  /** @member {string} */
  default as envMapEquirect,
} from "./env-map-equirect.glsl.js";
export {
  /** @member {string} */
  default as octMap,
} from "./oct-map.glsl.js";
export {
  /** @member {string} */
  default as octMapUvToDir,
} from "./oct-map-uv-to-dir.glsl.js";
export {
  /** @member {string} */
  default as irradiance,
} from "./irradiance.glsl.js";

export {
  /** @member {string} */
  default as textureCoordinates,
} from "./texture-coordinates.glsl.js";

export {
  /** @member {string} */
  default as baseColor,
} from "./base-color.glsl.js";
export {
  /** @member {string} */
  default as emissiveColor,
} from "./emissive-color.glsl.js";
export {
  /** @member {string} */
  default as normal,
} from "./normal.glsl.js";
export {
  /** @member {string} */
  default as normalPerturb,
} from "./normal-perturb.glsl.js";
export {
  /** @member {string} */
  default as metallicRoughness,
} from "./metallic-roughness.glsl.js";
export {
  /** @member {string} */
  default as specular,
} from "./specular.glsl.js";
export {
  /** @member {string} */
  default as specularGlossiness,
} from "./specular-glossiness.glsl.js";
export {
  /** @member {string} */
  default as clearCoat,
} from "./clear-coat.glsl.js";
export {
  /** @member {string} */
  default as sheenColor,
} from "./sheen-color.glsl.js";
export {
  /** @member {string} */
  default as transmission,
} from "./transmission.glsl.js";
export {
  /** @member {string} */
  default as alpha,
} from "./alpha.glsl.js";
export {
  /** @member {string} */
  default as ambientOcclusion,
} from "./ambient-occlusion.glsl.js";

export {
  /** @member {string} */
  default as depthRead,
} from "./depth-read.glsl.js";
export {
  /** @member {string} */
  default as depthPosition,
} from "./depth-position.glsl.js";
export {
  /** @member {string} */
  default as depthUnpack,
} from "./depth-unpack.glsl.js";
export {
  /** @member {string} */
  default as depthPack,
} from "./depth-pack.glsl.js";

export { /** @member {string} */ default as fog } from "./fog.glsl.js";
export { /** @member {string} */ default as fxaa } from "./fxaa.glsl.js";
export {
  /** @member {string} */ default as filmGrain,
} from "./film-grain.glsl.js";
export {
  /** @member {string} */
  default as lut,
} from "./lut.glsl.js";
export { default as colorCorrection } from "./color-correction.glsl.js";
export {
  /** @member {string} */
  default as vignette,
} from "./vignette.glsl.js";
