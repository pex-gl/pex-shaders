/** @module parser */

/**
 * GLSL 3 preprocessor version string
 */
export const GLSL3 = "#version 300 es";

/**
 * Format an object of extension names as key and extension behaviosr (enable/require/warn/disable) as value
 * @param {object} [extensions={}]
 * @returns {string}
 */
export function formatExtensions(extensions = {}) {
  return Object.entries(extensions)
    .map(([name, behavior]) => `#extension ${name} : ${behavior}`)
    .join("\n");
}

/**
 * Format an array of define keys
 * @param {string[]} [defines=[]]
 * @returns {string}
 */
export function formatDefines(defines = []) {
  return defines.map((flag) => `#define ${flag}`).join("\n");
}

/**
 * Add version string and format a list of defines for a shader source
 * @param {ctx} ctx
 * @param {string} src
 * @param {string[]} [defines=[]]
 * @param {object} [extensions={}]
 * @returns {string}
 */
export function build(ctx, src, defines = [], extensions = {}) {
  return `${ctx.capabilities.isWebGL2 ? GLSL3 : ""}
${formatExtensions(extensions)}
${formatDefines(defines)}
${src}`;
}

/**
 * Monkey patch a shader string for ES300 by replacing builtin keywords and un-necessary extensions, and adding the version preprocessor string
 * @param {string} src
 * @param {"vertex" | "fragment"} stage
 * @returns {string}
 */
export function patchES300(src, stage = "vertex") {
  src = src
    .replace(/texture2D/g, "texture")
    .replace(/textureCube/g, "texture")
    .replace(/texture2DProj/g, "textureProj")
    .replace("mat4 transpose(mat4 m) {", "mat4 transposeOld(mat4 m) {")
    .replace("mat3 transpose(mat3 m) {", "mat3 transposeOld(mat3 m) {")
    .replace("mat4 inverse(mat4 m) {", "mat4 inverseOld(mat4 m) {");

  if (stage === "vertex") {
    if (src.startsWith("#version")) src = src.split("\n").slice(1).join("\n");
    src = src.replace(/attribute/g, "in").replace(/varying/g, "out");
  } else if (stage === "fragment") {
    src = src
      .split("\n")
      .map((line) => {
        const trimmedLine = line.trim();
        if (
          [
            "#version",
            "#extension GL_OES_standard_derivatives",
            "#extension GL_EXT_shader_texture_lod",
            "#extension GL_EXT_draw_buffers",
            "#extension GL_EXT_frag_depth",
          ].some((extension) => trimmedLine.startsWith(extension))
        ) {
          return false;
        }
        return trimmedLine.startsWith("precision ")
          ? trimmedLine.replace(
              /;/,
              `;\nlayout (location = 0) out vec4 outColor;
layout (location = 1) out vec4 outNormal;
layout (location = 2) out vec4 outEmissive;`,
            )
          : line;
      })
      .map((line) => line || "")
      .join("\n")
      .replace(/varying/g, "in")
      .replace(/texture2DLodEXT/g, "textureLod")
      .replace(/texture2DProjLodEXT/g, "textureProjLod")
      .replace(/textureCubeLodEXT/g, "textureLod")
      .replace(/texture2DGradEXT/g, "textureGrad")
      .replace(/texture2DProjGradEXT/g, "textureProjGrad")
      .replace(/textureCubeGradEXT/g, "textureGrad")
      .replace(/gl_FragData\[0\]/g, "outColor")
      .replace(/gl_FragColor/g, "outColor")
      .replace(/gl_FragData\[1\]/g, "outNormal")
      .replace(/gl_FragData\[2\]/g, "outEmissive");
  }

  return `${GLSL3}\n${src}`;
}

/**
 * Unroll loops (looped preceded by "#pragma unroll_loop") for lights and replace their constant iterators
 * @param {string} src
 * @param {object} options
 * @returns {string}
 */
export function replaceStrings(src, options) {
  // Unroll loop
  const unrollLoopPattern =
    /#pragma unroll_loop[\s]+?for \(int i = (\d+); i < (\d+|\D+); i\+\+\) \{([\s\S]+?)(?=\})\}/g;

  src = src.replace(unrollLoopPattern, (match, start, end, snippet) => {
    let unroll = "";

    // Replace lights number
    end = end
      .replace(/NUM_AMBIENT_LIGHTS/g, options.ambientLights.length || 0)
      .replace(/NUM_DIRECTIONAL_LIGHTS/g, options.directionalLights.length || 0)
      .replace(/NUM_POINT_LIGHTS/g, options.pointLights.length || 0)
      .replace(/NUM_SPOT_LIGHTS/g, options.spotLights.length || 0)
      .replace(/NUM_AREA_LIGHTS/g, options.areaLights.length || 0);

    for (let i = Number.parseInt(start); i < Number.parseInt(end); i++) {
      unroll += snippet.replace(/\[i\]/g, `[${i}]`);
    }

    return unroll;
  });

  return src;
}

/**
 * Get a formatted error pointing at the issue line
 * @param {Error} error
 * @param {{ vert: string, frag: string, count: number }} options
 * @returns {string}
 */
export function getFormattedError(error, { vert, frag, count = 5 }) {
  const lines = (error.message.match(/Vertex/) ? vert : frag).split("\n");
  const lineNo = parseInt(error.message.match(/ERROR: ([\d]+):([\d]+)/)[2]);
  const startIndex = Math.max(lineNo - count, 0);
  return lines
    .slice(startIndex, Math.min(lineNo + count, lines.length - 1))
    .map((line, i) =>
      startIndex + i == lineNo - 1 ? `--> ${line}` : `    ${line}`,
    )
    .join("\n");
}
