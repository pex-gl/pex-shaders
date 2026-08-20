/** @module pex-shaders */

/**
 * Various shader chunks to be inserted in main shaders
 *
 * @type {module:chunks}
 * @name chunks
 * @static
 */
export * as chunks from "./shaders/chunks/index.js";

/**
 * Shader string manipulation helpers
 *
 * @type {module:parser}
 * @name parser
 * @static
 */
export * as parser from "./parser.js";

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
 * Re-export SMAA's precomputed area and search lookup textures. The algorithm
 * itself lives in the smaa chunk, as WGSL.
 *
 * @memberof module:pex-shaders
 * @type {object}
 * @name SMAATextures
 * @static
 * @see {@link https://github.com/dmnsgn/glsl-smaa}
 */
export { SMAATextures } from "glsl-smaa";
