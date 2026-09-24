/** @module pex-shaders */

/**
 * Various shaders to be inserted in main shaders
 *
 * @type {module:shaders}
 * @name shaders
 * @static
 */
export * as shaders from "./shaders/index.js";

/**
 * Re-export tone mapping functions
 *
 * @memberof module:pex-shaders
 * @type {object}
 * @name toneMap
 * @static
 * @see {@link https://www.npmjs.com/package/wgsl-tone-map}
 */
export * as toneMap from "wgsl-tone-map";

/**
 * Re-export SMAA functions and textures
 *
 * @memberof module:pex-shaders
 * @type {object}
 * @name smaa
 * @static
 * @see {@link https://www.npmjs.com/package/wgsl-smaa}
 */
export * as smaa from "wgsl-smaa";
