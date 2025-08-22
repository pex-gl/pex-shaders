/** @module reflectionProbe */

import blitToOctMapAtlasFrag from "./blit-to-oct-map-atlas.frag.js";
import convolveOctMapAtlasToOctMapFrag from "./convolve-oct-map-atlas-to-oct-map.frag.js";
import cubemapToOctmapFrag from "./cubemap-to-octmap.frag.js";
import downsampleFromOctMapAtlasFrag from "./downsample-from-oct-map-atlas.frag.js";
import prefilterFromOctMapAtlasFrag from "./prefilter-from-oct-map-atlas.frag.js";

/**
 * @member {object}
 * @static
 */
export const blitToOctMapAtlas = { frag: blitToOctMapAtlasFrag };
/**
 * @member {object}
 * @static
 */
export const convolveOctMapAtlasToOctMap = {
  frag: convolveOctMapAtlasToOctMapFrag,
};
/**
 * @member {object}
 * @static
 */
export const cubemapToOctMap = { frag: cubemapToOctmapFrag };
/**
 * @member {object}
 * @static
 */
export const downsampleFromOctMapAtlas = {
  frag: downsampleFromOctMapAtlasFrag,
};
/**
 * @member {object}
 * @static
 */
export const prefilterFromOctMapAtlas = { frag: prefilterFromOctMapAtlasFrag };
