/** @module pex-shaders */

/**
 * Various shader chunks to be inserted in main shaders
 * @type {module:chunks}
 * @name chunks
 * @static
 */
export * as chunks from "./shaders/chunks/index.js";

/**
 * Main shaders
 * @type {module:pipeline}
 * @name pipeline
 * @static
 */
export * as pipeline from "./shaders/pipeline/index.js";

/**
 * Post-processing shaders that operate on fullscreen
 * @type {module:postProcessing}
 * @name postProcessing
 * @static
 */
export * as postProcessing from "./shaders/post-processing/index.js";

/**
 * Reflection probes specific shaders
 * @type {module:reflectionProbe}
 * @name reflectionProbe
 * @static
 */
export * as reflectionProbe from "./shaders/reflection-probe/index.js";

/**
 * Skybox specific shaders
 * @type {module:skybox}
 * @name skybox
 * @static
 */
export * as skybox from "./shaders/skybox/index.js";

/**
 * Shader string manipulation helpers
 * @type {module:parser}
 * @name parser
 * @static
 */
export * as parser from "./parser.js";

/**
 * Re-export tone mapping functions
 * @type {object}
 * @name toneMap
 * @static
 * @memberof module:pex-shaders
 * @see {@link https://github.com/dmnsgn/glsl-tone-map}
 */
export * as toneMap from "glsl-tone-map";
