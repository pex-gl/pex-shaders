/** @module pipeline */

import blitVert from "./blit.vert.js";
import blitFrag from "./blit.frag.js";
import depthPassVert from "./depth-pass.vert.js";
import depthPassFrag from "./depth-pass.frag.js";
import depthPrePassFrag from "./depth-pre-pass.frag.js";
import standardFrag from "./standard.frag.js";
import standardVert from "./standard.vert.js";
import basicFrag from "./basic.frag.js";
import basicVert from "./basic.vert.js";
import lineFrag from "./line.frag.js";
import lineVert from "./line.vert.js";
import overlayFrag from "./overlay.frag.js";
import overlayVert from "./overlay.vert.js";
import helperFrag from "./helper.frag.js";
import helperVert from "./helper.vert.js";
import errorFrag from "./error.frag.js";
import errorVert from "./error.vert.js";

/**
 * @member {object}
 * @static
 */ export const blit = { vert: blitVert, frag: blitFrag };
/**
 * @member {object}
 * @static
 */
export const depthPass = { vert: depthPassVert, frag: depthPassFrag };
/**
 * @member {object}
 * @static
 */
export const depthPrePass = { frag: depthPrePassFrag };
/**
 * @member {object}
 * @static
 */
export const standard = { vert: standardVert, frag: standardFrag };
/**
 * @member {object}
 * @static
 */
export const basic = { vert: basicVert, frag: basicFrag };
/**
 * @member {object}
 * @static
 */
export const line = { vert: lineVert, frag: lineFrag };
/**
 * @member {object}
 * @static
 */
export const overlay = { vert: overlayVert, frag: overlayFrag };
/**
 * @member {object}
 * @static
 */
export const helper = { vert: helperVert, frag: helperFrag };
/**
 * @member {object}
 * @static
 */
export const error = { vert: errorVert, frag: errorFrag };
