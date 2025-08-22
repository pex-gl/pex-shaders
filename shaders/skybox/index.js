/** @module skybox */

import skyboxVert from "./skybox.vert.js";
import skyboxFrag from "./skybox.frag.js";
import skyEnvMapVert from "./sky-env-map.vert.js";
import skyEnvMapFrag from "./sky-env-map.frag.js";

/**
 * @member {object}
 * @static
 */
export const skybox = { vert: skyboxVert, frag: skyboxFrag };
/**
 * @member {object}
 * @static
 */
export const skyEnvMap = { vert: skyEnvMapVert, frag: skyEnvMapFrag };
