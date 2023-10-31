/** @module pex-shaders */

/**
 * Various shader chunks to be inserted in main shaders
 * @type {object}
 */
export * as chunks from "./shaders/chunks/index.js";

export {
  /**
   * Main shaders
   * @type {object}
   */
  default as pipeline,
} from "./shaders/pipeline/index.js";
export {
  /**
   * Post-processing shaders that operate on fullscreen
   * @type {object}
   */
  default as postProcessing,
} from "./shaders/post-processing/index.js";
export {
  /**
   * Reflection probes specific shaders
   * @type {object}
   */
  default as reflectionProbe,
} from "./shaders/reflection-probe/index.js";
export {
  /**
   * Skybox specific shaders
   * @type {object}
   */
  default as skybox,
} from "./shaders/skybox/index.js";

/**
 * Shader string manipulation helpers
 * @type {parser}
 * @name parser
 * @static
 */
export * as parser from "./parser.js";

/**
 * Re-export tone mapping functions
 * @type {object}
 */
export * as toneMap from "glsl-tone-map";
