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
import fullscreenVert from "./fullscreen.vert.js";

export default {
  blit: { vert: blitVert, frag: blitFrag },
  depthPass: { vert: depthPassVert, frag: depthPassFrag },
  depthPrePass: { depthPassVert, frag: depthPrePassFrag },
  standard: { vert: standardVert, frag: standardFrag },
  basic: { vert: basicVert, frag: basicFrag },
  line: { vert: lineVert, frag: lineFrag },
  overlay: { vert: overlayVert, frag: overlayFrag },
  helper: { vert: helperVert, frag: helperFrag },
  error: { vert: errorVert, frag: errorFrag },
  fullscreen: { vert: fullscreenVert },
};
