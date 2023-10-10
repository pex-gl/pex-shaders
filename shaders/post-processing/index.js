import bilateralBlurFrag from "./bilateral-blur.frag.js";
import dofFrag from "./dof.frag.js";
import downSampleFrag from "./down-sample.frag.js";
import postProcessingFrag from "./post-processing.frag.js";
import postProcessingVert from "./post-processing.vert.js";
import saoFrag from "./sao.frag.js";
import gtaoFrag from "./gtao.frag.js";
import thresholdFrag from "./threshold.frag.js";
import upSample from "./up-sample.frag.js";

export default {
  bilateralBlur: { frag: bilateralBlurFrag },
  dof: { frag: dofFrag },
  downSample: { frag: downSampleFrag },
  postProcessing: { vert: postProcessingVert, frag: postProcessingFrag },
  sao: { frag: saoFrag },
  gtao: { frag: gtaoFrag },
  threshold: { frag: thresholdFrag },
  upSample: { frag: upSample },
};
