/** @module postProcessing */

import bilateralBlurFrag from "./bilateral-blur.frag.js";
import dofFrag from "./dof.frag.js";
import downsampleFrag from "./downsample.frag.js";
import postProcessingFrag from "./post-processing.frag.js";
import postProcessingVert from "./post-processing.vert.js";
import saoFrag from "./sao.frag.js";
import gtaoFrag from "./gtao.frag.js";
import thresholdFrag from "./threshold.frag.js";
import upsampleFrag from "./upsample.frag.js";

/**
 * @member {object}
 * @static
 */
export const bilateralBlur = { frag: bilateralBlurFrag };
/**
 * @member {object}
 * @static
 */
export const dof = { frag: dofFrag };
/**
 * @member {object}
 * @static
 */
export const downsample = { frag: downsampleFrag };
/**
 * @member {object}
 * @static
 */
export const postProcessing = {
  vert: postProcessingVert,
  frag: postProcessingFrag,
};
/**
 * @member {object}
 * @static
 */
export const sao = { frag: saoFrag };
/**
 * @member {object}
 * @static
 */
export const gtao = { frag: gtaoFrag };
/**
 * @member {object}
 * @static
 */
export const threshold = { frag: thresholdFrag };
/**
 * @member {object}
 * @static
 */
export const upsample = { frag: upsampleFrag };
