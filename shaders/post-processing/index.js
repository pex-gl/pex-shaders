/** @module postProcessing */

import postProcessingVert from "./post-processing.vert.js";
import gtaoFrag from "./gtao.frag.js";
import saoFrag from "./sao.frag.js";
import bilateralBlurFrag from "./bilateral-blur.frag.js";

import dofFrag from "./dof.frag.js";

import thresholdFrag from "./threshold.frag.js";
import downsampleFrag from "./downsample.frag.js";
import upsampleFrag from "./upsample.frag.js";

import ssaoMixFrag from "./ssao-mix.frag.js";
import combineFrag from "./combine.frag.js";
import lumaFrag from "./luma.frag.js";
import finalFrag from "./final.frag.js";

/**
 * @member {object}
 * @static
 */
export const postProcessing = { vert: postProcessingVert };

/**
 * @member {object}
 * @static
 */
export const gtao = { frag: gtaoFrag };
/**
 * @member {object}
 * @static
 */
export const sao = { frag: saoFrag };
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
export const threshold = { frag: thresholdFrag };
/**
 * @member {object}
 * @static
 */
export const downsample = { frag: downsampleFrag };
/**
 * @member {object}
 * @static
 */
export const upsample = { frag: upsampleFrag };

/**
 * @member {object}
 * @static
 */
export const ssaoMix = { frag: ssaoMixFrag };
/**
 * @member {object}
 * @static
 */
export const combine = { frag: combineFrag };
/**
 * @member {object}
 * @static
 */
export const luma = { frag: lumaFrag };
/**
 * @member {object}
 * @static
 */
export const final = { frag: finalFrag };
