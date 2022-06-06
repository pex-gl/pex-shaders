import depthPassVert from "./depth-pass.vert.js";
import depthPassFrag from "./depth-pass.frag.js";
import depthPrePassFrag from "./depth-pre-pass.frag.js";
import materialFrag from "./material.frag.js";
import materialVert from "./material.vert.js";
import overlayFrag from "./overlay.frag.js";
import overlayVert from "./overlay.vert.js";
import helperFrag from "./helper.frag.js";
import helperVert from "./helper.vert.js";

export default {
  depthPass: { vert: depthPassVert, frag: depthPassFrag },
  depthPrePass: { depthPassVert, frag: depthPrePassFrag },
  material: { vert: materialVert, frag: materialFrag },
  overlay: { vert: overlayVert, frag: overlayFrag },
  helper: { vert: helperVert, frag: helperFrag },
};
