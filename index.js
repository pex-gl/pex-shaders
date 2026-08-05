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
 * @see {@link https://github.com/dmnsgn/glsl-tone-map}
 */
export * as toneMap from "glsl-tone-map";

/**
 * Re-export smaa
 *
 * @memberof module:pex-shaders
 * @type {object}
 * @name smaa
 * @static
 * @see {@link https://github.com/dmnsgn/glsl-smaa}
 */
export * as smaa from "glsl-smaa";
