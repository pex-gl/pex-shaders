import bilateralBlurFrag from "./bilateral-blur.frag.js";
import dofFrag from "./dof.frag.js";
import downsampleFrag from "./downsample.frag.js";
import postProcessingFrag from "./post-processing.frag.js";
import postProcessingVert from "./post-processing.vert.js";
import saoFrag from "./sao.frag.js";
import gtaoFrag from "./gtao.frag.js";
import thresholdFrag from "./threshold.frag.js";
import upsampleFrag from "./upsample.frag.js";

export default {
  bilateralBlur: { frag: bilateralBlurFrag },
  dof: { frag: dofFrag },
  downsample: { frag: downsampleFrag },
  postProcessing: { vert: postProcessingVert, frag: postProcessingFrag },
  sao: { frag: saoFrag },
  gtao: { frag: gtaoFrag },
  threshold: { frag: thresholdFrag },
  upsample: { frag: upsampleFrag },
};
