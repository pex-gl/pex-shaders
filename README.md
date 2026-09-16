# pex-shaders

[![npm version](https://img.shields.io/npm/v/pex-shaders)](https://www.npmjs.com/package/pex-shaders)
[![stability-stable](https://img.shields.io/badge/stability-stable-green.svg)](https://www.npmjs.com/package/pex-shaders)
[![npm minzipped size](https://img.shields.io/bundlephobia/minzip/pex-shaders)](https://bundlephobia.com/package/pex-shaders)
[![dependencies](https://img.shields.io/librariesio/release/npm/pex-shaders)](https://github.com/pex-gl/pex-shaders/blob/main/package.json)
[![types](https://img.shields.io/npm/types/pex-shaders)](https://github.com/microsoft/TypeScript)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fa6673.svg)](https://conventionalcommits.org)
[![styled with prettier](https://img.shields.io/badge/styled_with-Prettier-f8bc45.svg?logo=prettier)](https://github.com/prettier/prettier)
[![linted with eslint](https://img.shields.io/badge/linted_with-ES_Lint-4B32C3.svg?logo=eslint)](https://github.com/eslint/eslint)
[![license](https://img.shields.io/github/license/pex-gl/pex-shaders)](https://github.com/pex-gl/pex-shaders/blob/main/LICENSE.md)

Shader library and manipulation for [PEX](https://pex.gl).

![](https://raw.githubusercontent.com/pex-gl/pex-shaders/main/screenshot.gif)

## Installation

```bash
npm install pex-shaders
```

## Usage

```js
import { pipeline, parser } from "pex-shaders";
import createContext from "pex-context";

const ctx = createContext();

const defines = [
  "USE_BASE_COLOR_TEXTURE",
  // ...
];

const program = {
  vert: parser.build(ctx, pipeline.material.vert, defines),
  frag: parser.replaceStrings(
    parser.build(ctx, pipeline.material.frag, defines),
    { directionalLights: 3 }
  ),
};
```

## API

- All GLSL shaders are by default written using GLSL 1. They also provide support for GLSL 3 where possible using the `__VERSION__` standard macro, `#define` for built-ins keywords and `parser.build(ctx, src)`.
- PBR material fragment shader specifies 3 named outputs for `gl_FragData`: `outColor`, `outEmissiveColor` and `outNormal`.
- Defines and extensions can also be prepended with `parser.build(ctx, src, defines, extensions)`
- Pipeline shaders have hooks for easy string replace:
  - `#define HOOK_VERT_DECLARATIONS_END`
  - `#define HOOK_VERT_END`
  - `#define HOOK_FRAG_DECLARATIONS_END`
  - `#define HOOK_FRAG_END`
- PBR material has additional hooks:
  - `#define HOOK_VERT_BEFORE_TRANSFORM`
  - `#define HOOK_FRAG_BEFORE_TEXTURES`
  - `#define HOOK_FRAG_BEFORE_LIGHTING`
  - `#define HOOK_FRAG_AFTER_LIGHTING`

<!-- api-start -->

## Modules

<dl>
<dt><a href="#module_pex-shaders">pex-shaders</a></dt>
<dd></dd>
<dt><a href="#module_shaders">shaders</a></dt>
<dd></dd>
</dl>

## Members

<dl>
<dt><a href="#default">default</a> : <code>string</code></dt>
<dd><p>Motion blur reconstruction filter</p>
<p>Tile-based scatter-as-gather: the velocity buffer is reduced to a coarse grid
of dominant motions, each tile takes the largest motion that could reach it
from its neighbours, and every pixel then gathers colour along that motion
weighting each sample by whether it plausibly smeared over the pixel.</p>
<p>Paper: Guertin, McGuire &amp; Nowrouzezahrai, &quot;A Fast and Stable Feature-Aware
Motion Blur Filter&quot;, High Performance Graphics 2014 — Appendix A.
<a href="https://casual-effects.com/research/Guertin2014MotionBlur/">https://casual-effects.com/research/Guertin2014MotionBlur/</a></p>
<p>It builds on the tile framework of McGuire, Hennessy, Bukowski &amp; Osman, &quot;A
Reconstruction Filter for Plausible Motion Blur&quot; (I3D 2012), and differs from
it in the four places that matter: samples alternate between the tile&#39;s
dominant motion and the pixel&#39;s own so a tile whose neighbours disagree does
not smear in a direction nothing there is moving; the centre sample is
weighted and normalised by the sample count rather than special-cased, which
is what stops thin features ghosting; the depth comparison is relative rather
than scaled by a scene-dependent constant; and diagonal tiles are only
considered when their motion actually points inwards.</p>
<p>Requires <code>math.saturate</code> and <code>depthRead</code>.</p>
<p>Updates: Damien Seguin (2026-08)</p>
</dd>
<dt><a href="#default">default</a> : <code>string</code></dt>
<dd><p>RCAS (Robust Contrast Adaptive Sharpening)</p>
<p>The sharpening pass from AMD FidelityFX Super Resolution 1.0, which is CAS
reduced to what is safe to run after a resolve: no scaling, and a limiter
derived from the local range so it cannot ring.</p>
<p>Reference:
<a href="https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h">https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h</a></p>
<p>Takes its five taps as parameters rather than sampling: the limiter assumes a
roughly [0, 1] signal, so a caller working in HDR has to normalise before it
reaches here and undo that after.</p>
<p>Requires <code>math.max3</code>.</p>
<p>Updates: Damien Seguin (2026-08)</p>
</dd>
<dt><a href="#default">default</a> : <code>string</code></dt>
<dd><p>TAA (Temporal Antialiasing)</p>
<p>Accumulates a jittered sequence of frames into one converged image,
reprojecting the previous result through this frame&#39;s depth so a moving
camera keeps what it already resolved.</p>
<p>Synthesised from the techniques that make it hold up rather than from one
reference: Karis&#39; tonemapped blend space, reconstruction-filtered current
sample, rounded min/max neighbourhood and history clipping (&quot;High Quality
Temporal Supersampling&quot;, SIGGRAPH 2014), Salvi&#39;s variance clipping (&quot;An
Excursion in Temporal Supersampling&quot;, GDC 2016) widening it where the
neighbourhood understates the real range, and bicubic history resampling.</p>
<p>The two halves of the blend have to describe the same thing for the sequence
to converge: the history is an estimate at the pixel centre, so the current
frame is reconstructed onto the pixel centre before it is mixed in rather
than being taken as the one jittered sample stored there.</p>
<p>Requires <code>luminance</code>.</p>
<p>Updates: Damien Seguin (2026-08)</p>
</dd>
</dl>

## Constants

<dl>
<dt><a href="#multiBounce">multiBounce</a> : <code>string</code></dt>
<dd><p>GtaoMultiBounce: Jimenez et al. 2016, &quot;Practical Realtime Strategies for
Accurate Indirect Occlusion&quot;
<a href="https://github.com/google/filament/blob/e1dfea0f121f3ee0e552fc010f0dde5ed9c7e783/shaders/src/ambient_occlusion.fs">https://github.com/google/filament/blob/e1dfea0f121f3ee0e552fc010f0dde5ed9c7e783/shaders/src/ambient_occlusion.fs</a>
<a href="https://google.github.io/filament/Materials.md.html#materialdefinitions/materialblock/lighting:multibounceambientocclusion">https://google.github.io/filament/Materials.md.html#materialdefinitions/materialblock/lighting:multibounceambientocclusion</a>
Returns a color ambient occlusion based on a pre-computed visibility term.
The albedo term is meant to be the diffuse color or f0 for the diffuse and
specular terms respectively.</p>
</dd>
<dt><a href="#specular">specular</a> : <code>string</code></dt>
<dd><p>Specular occlusion derived from the diffuse visibility term, after Lagarde
and de Rousiers 2014, &quot;Moving Frostbite to PBR&quot;.</p>
<p>Reusing the diffuse visibility for the specular lobe over-occludes a smooth
surface, whose lobe is narrow enough to miss the occluder entirely.</p>
<p>Smoothness in <code>visibility</code> matters more here than accuracy. The
cone-intersection alternative (Jimenez et al. 2016 §4.4, using a bent normal)
is sharper in principle, but its aperture goes as <code>sqrt(1 - visibility)</code>,
whose derivative is unbounded at full visibility, and for a smooth material
its specular cone is a fraction of a degree wide — so it degenerates into a
step function positioned by the AO term. Fed a screen-space AO buffer sitting
near 1, per-pixel noise far below the visible threshold lands on both sides
of that step and reads as binary speckle on grazing surfaces. This one is
monotone and branchless, and needs no bent normal.</p>
<p>Requires <a href="#multiBounce">multiBounce</a> for the coloured variant.</p>
</dd>
<dt><a href="#texture">texture</a> : <code>string</code></dt>
<dd><p>The material&#39;s occlusion texture read.</p>
</dd>
<dt><a href="#common">common</a> : <code>string</code></dt>
<dd><p>The parameter block. Every other member builds on it, and it is all the
gather needs — that pass works from a prefiltered circle of confusion and
never touches depth.</p>
</dd>
<dt><a href="#depth">depth</a> : <code>string</code></dt>
<dd><p>Linear depth, in the millimetres the thin lens model works in. Requires
<a href="#common">common</a> and <code>depthRead</code>.</p>
</dd>
<dt><a href="#coc">coc</a> : <code>string</code></dt>
<dd><p>Circle of confusion from depth, under either model. Requires <a href="#common">common</a>,
and <a href="#depth">depth</a> for the callers that read it off the depth buffer.</p>
</dd>
<dt><a href="#focus">focus</a> : <code>string</code></dt>
<dd><p>Autofocus: the distance the frame focuses at, read off a screen point.
Requires <a href="#common">common</a> and <a href="#depth">depth</a>.</p>
</dd>
<dt><a href="#resolve">resolve</a> : <code>string</code></dt>
<dd><p>Temporal resolve of the circle of confusion, which a jittered raster needs
before anything prefilters it. Requires <a href="#common">common</a>, <a href="#depth">depth</a> and
<a href="#coc">coc</a>.</p>
</dd>
<dt><a href="#downsample">downsample</a> : <code>string</code></dt>
<dd><p>The prefilter&#39;s mip chain, and the bilateral weight it shares with the
prefilter itself. Needs neither depth nor the parameters — a level is a
filter over colour and a circle of confusion that are already computed.
Requires <code>math.saturate</code>.</p>
</dd>
<dt><a href="#prefilter">prefilter</a> : <code>string</code></dt>
<dd><p>Half-resolution colour and circle of confusion in one texture. Requires
<a href="#common">common</a>, <a href="#depth">depth</a>, <a href="#coc">coc</a>, <a href="#downsample">downsample</a>, <code>math.saturate</code>,
<code>luma</code> and <code>threshold</code>.</p>
</dd>
<dt><a href="#tiles">tiles</a> : <code>string</code></dt>
<dd><p>The coarse grid that bounds the near field&#39;s search, and its dilation.
Standalone, like <a href="#downsample">downsample</a>.</p>
</dd>
<dt><a href="#gather">gather</a> : <code>string</code></dt>
<dd><p>The two fields, each gathered over the span it actually needs. Requires
<a href="#common">common</a>, <code>math.PI</code>, <code>math.TWO_PI</code> and <code>math.saturate</code>.</p>
</dd>
<dt><a href="#postFilter">postFilter</a> : <code>string</code></dt>
<dd><p>The near field&#39;s post filter: a median that rejects the speckle a dithered
gather leaves along a silhouette. Requires <code>luma</code>.</p>
</dd>
<dt><a href="#composite">composite</a> : <code>string</code></dt>
<dd><p>The two fields over the sharp image, at full resolution, and the debug view.
Requires <a href="#common">common</a> and <code>math.saturate</code>.</p>
</dd>
<dt><a href="#common">common</a> : <code>string</code></dt>
<dd><p>Constants, parameters and the helpers both passes share. Requires <code>math.PI</code>,
<code>math.HALF_PI</code>, <code>math.saturate</code> and <code>depthRead</code>.</p>
</dd>
<dt><a href="#main">main</a> : <code>string</code></dt>
<dd><p>The estimator: a horizon search over <code>GTAO_NUM_SLICES</code> slices of
<code>GTAO_NUM_STEPS_PER_SLICE</code> steps, producing visibility, a bent normal under
<code>USE_GTAO_BENT_NORMALS</code>, and the edge weights the denoiser needs. Requires
<a href="#common">common</a>, <code>depthPyramid</code> and <code>colorCorrection</code>.</p>
</dd>
<dt><a href="#denoise">denoise</a> : <code>string</code></dt>
<dd><p>Edge-aware denoiser. Averages a 3x3 neighbourhood weighted by the estimator&#39;s
edges, so occlusion never crosses a depth discontinuity. <code>finalApply</code>
restores the UNORM scale and renormalises the bent normal, and belongs on the
last pass only. Requires <a href="#common">common</a> and <a href="#main">main</a>.</p>
</dd>
<dt><a href="#common">common</a> : <code>string</code></dt>
<dd><p>Parameters, the optical centre remappings and the spectral sweep every family
samples through. Requires <code>math.TWO_PI</code>.</p>
</dd>
<dt><a href="#ghosts">ghosts</a> : <code>string</code></dt>
<dd><p>Ghosts: the aperture imaged by pairs of internal reflections, scaled about
the optical centre. Requires <a href="#common">common</a>.</p>
</dd>
<dt><a href="#halo">halo</a> : <code>string</code></dt>
<dd><p>Halo: everything at a fixed distance from the optical axis, brought to the
same radius. Requires <a href="#common">common</a>.</p>
</dd>
<dt><a href="#streak">streak</a> : <code>string</code></dt>
<dd><p>Streaks: the diaphragm&#39;s diffraction spikes, as one directional blur chain
per spike axis. Requires <a href="#common">common</a>.</p>
<p>Every direction lives in one texture, as a horizontal band. The chains have
to stay separate — blurring a spike along another spike&#39;s axis thickens it
into a blob rather than crossing it — but they are the same filter with a
different vector, so banding them keeps the chain at one pass per iteration
whatever the blade count, instead of one per iteration per direction.</p>
</dd>
<dt><a href="#common">common</a> : <code>string</code></dt>
<dd><p>Quality preset and shared helpers. Required by all three passes.</p>
<p>The preset overrides map to the reference&#39;s SMAA_PRESET_* blocks: low/medium
disable diagonal and corner detection outright.</p>
</dd>
<dt><a href="#edges">edges</a> : <code>string</code></dt>
<dd><p>Pass 1: edge detection. Writes the left/top edge pair, and discards where
there is none — the stencil-like early out the reference relies on.</p>
<p>Requires <a href="#common">common</a> and, for the color and luma variants, the encodeDecode
chunk.</p>
</dd>
<dt><a href="#weights">weights</a> : <code>string</code></dt>
<dd><p>Pass 2: blending weight calculation. Searches the edge buffer for the
distance to each line end, then looks up the precomputed coverage area.</p>
<p>Requires <a href="#common">common</a>.</p>
</dd>
<dt><a href="#blend">blend</a> : <code>string</code></dt>
<dd><p>Pass 3: neighborhood blending. Mixes the pixel with the neighbor its blending
weight points at, exploiting bilinear filtering to do it in one tap per
direction.</p>
<p>Requires <a href="#common">common</a>.</p>
</dd>
</dl>

<a name="module_pex-shaders"></a>

## pex-shaders

- [pex-shaders](#module_pex-shaders)
  - [.shaders](#module_pex-shaders.shaders) : [<code>shaders</code>](#module_shaders)
  - [.toneMap](#module_pex-shaders.toneMap) : <code>object</code>
  - [.SMAATextures](#module_pex-shaders.SMAATextures) : <code>object</code>

<a name="module_pex-shaders.shaders"></a>

### pex-shaders.shaders : [<code>shaders</code>](#module_shaders)

Various shaders to be inserted in main shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.toneMap"></a>

### pex-shaders.toneMap : <code>object</code>

Re-export tone mapping functions

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
**See**: [https://www.npmjs.com/package/wgsl-tone-map](https://www.npmjs.com/package/wgsl-tone-map)
<a name="module_pex-shaders.SMAATextures"></a>

### pex-shaders.SMAATextures : <code>object</code>

Re-export SMAA's precomputed area and search lookup textures

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
**See**: [https://github.com/dmnsgn/glsl-smaa](https://github.com/dmnsgn/glsl-smaa)
<a name="module_shaders"></a>

## shaders

- [shaders](#module_shaders)
  - [.math](#module_shaders.math) : <code>object</code>
  - [.encodeDecode](#module_shaders.encodeDecode) : <code>string</code>
  - [.luma](#module_shaders.luma) : <code>string</code>
  - [.luminance](#module_shaders.luminance) : <code>string</code>
  - [.average](#module_shaders.average) : <code>string</code>
  - [.lightAmbient](#module_shaders.lightAmbient) : <code>string</code>
  - [.lightDirectional](#module_shaders.lightDirectional) : <code>string</code>
  - [.lightPoint](#module_shaders.lightPoint) : <code>string</code>
  - [.lightSpot](#module_shaders.lightSpot) : <code>string</code>
  - [.lightArea](#module_shaders.lightArea) : <code>string</code>
  - [.shadowing](#module_shaders.shadowing) : <code>string</code>
  - [.brdf](#module_shaders.brdf) : <code>string</code>
  - [.direct](#module_shaders.direct) : <code>string</code>
  - [.indirect](#module_shaders.indirect) : <code>string</code>
  - [.envMapEquirect](#module_shaders.envMapEquirect) : <code>string</code>
  - [.sky](#module_shaders.sky) : <code>string</code>
  - [.textureCoordinates](#module_shaders.textureCoordinates) : <code>string</code>
  - [.baseColor](#module_shaders.baseColor) : <code>string</code>
  - [.emissive](#module_shaders.emissive) : <code>string</code>
  - [.normal](#module_shaders.normal) : <code>string</code>
  - [.normalPerturb](#module_shaders.normalPerturb) : <code>string</code>
  - [.metallicRoughness](#module_shaders.metallicRoughness) : <code>string</code>
  - [.specular](#module_shaders.specular) : <code>string</code>
  - [.specularGlossiness](#module_shaders.specularGlossiness) : <code>string</code>
  - [.clearcoat](#module_shaders.clearcoat) : <code>string</code>
  - [.sheenColor](#module_shaders.sheenColor) : <code>string</code>
  - [.transmission](#module_shaders.transmission) : <code>string</code>
  - [.alpha](#module_shaders.alpha) : <code>string</code>
  - [.depthRead](#module_shaders.depthRead) : <code>string</code>
  - [.depthPosition](#module_shaders.depthPosition) : <code>string</code>
  - [.depthPyramid](#module_shaders.depthPyramid) : <code>string</code>
  - [.depthUnpack](#module_shaders.depthUnpack) : <code>string</code>
  - [.depthPack](#module_shaders.depthPack) : <code>string</code>
  - [.lut](#module_shaders.lut) : <code>string</code>
  - [.vignette](#module_shaders.vignette) : <code>string</code>
  - [.threshold](#module_shaders.threshold) : <code>string</code>
  - [.downsample](#module_shaders.downsample) : <code>string</code>
  - [.upsample](#module_shaders.upsample) : <code>string</code>
  - [.blur](#module_shaders.blur) : <code>string</code>
  - [.sao](#module_shaders.sao) : <code>string</code>
  - [.motionBlur](#module_shaders.motionBlur) : <code>string</code>
  - [.sharpen](#module_shaders.sharpen) : <code>string</code>
  - [.taa](#module_shaders.taa) : <code>string</code>
  - [.blur](#module_shaders.blur) : <code>string</code>
  - [.colorCorrection](#module_shaders.colorCorrection) : <code>string</code>
  - [.depthPyramid](#module_shaders.depthPyramid) : <code>string</code>
  - [.downsample](#module_shaders.downsample) : <code>string</code>
  - [.filmGrain](#module_shaders.filmGrain) : <code>string</code>
  - [.fog](#module_shaders.fog) : <code>string</code>
  - [.fxaa](#module_shaders.fxaa) : <code>string</code>
  - [.reversibleToneMap](#module_shaders.reversibleToneMap) : <code>string</code>
  - [.sao](#module_shaders.sao) : <code>string</code>
  - [.sky](#module_shaders.sky) : <code>string</code>
  - [.threshold](#module_shaders.threshold) : <code>string</code>
  - [.upsample](#module_shaders.upsample) : <code>string</code>
  - [.noise](#module_shaders.noise) : <code>object</code>

<a name="module_shaders.math"></a>

### shaders.math : <code>object</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.encodeDecode"></a>

### shaders.encodeDecode : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.luma"></a>

### shaders.luma : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.luminance"></a>

### shaders.luminance : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.average"></a>

### shaders.average : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.lightAmbient"></a>

### shaders.lightAmbient : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.lightDirectional"></a>

### shaders.lightDirectional : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.lightPoint"></a>

### shaders.lightPoint : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.lightSpot"></a>

### shaders.lightSpot : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.lightArea"></a>

### shaders.lightArea : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.shadowing"></a>

### shaders.shadowing : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.brdf"></a>

### shaders.brdf : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.direct"></a>

### shaders.direct : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.indirect"></a>

### shaders.indirect : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.envMapEquirect"></a>

### shaders.envMapEquirect : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.sky"></a>

### shaders.sky : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.textureCoordinates"></a>

### shaders.textureCoordinates : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.baseColor"></a>

### shaders.baseColor : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.emissive"></a>

### shaders.emissive : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.normal"></a>

### shaders.normal : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.normalPerturb"></a>

### shaders.normalPerturb : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.metallicRoughness"></a>

### shaders.metallicRoughness : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.specular"></a>

### shaders.specular : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.specularGlossiness"></a>

### shaders.specularGlossiness : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.clearcoat"></a>

### shaders.clearcoat : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.sheenColor"></a>

### shaders.sheenColor : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.transmission"></a>

### shaders.transmission : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.alpha"></a>

### shaders.alpha : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.depthRead"></a>

### shaders.depthRead : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.depthPosition"></a>

### shaders.depthPosition : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.depthPyramid"></a>

### shaders.depthPyramid : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.depthUnpack"></a>

### shaders.depthUnpack : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.depthPack"></a>

### shaders.depthPack : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.lut"></a>

### shaders.lut : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.vignette"></a>

### shaders.vignette : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.threshold"></a>

### shaders.threshold : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.downsample"></a>

### shaders.downsample : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.upsample"></a>

### shaders.upsample : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.blur"></a>

### shaders.blur : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.sao"></a>

### shaders.sao : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.motionBlur"></a>

### shaders.motionBlur : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.sharpen"></a>

### shaders.sharpen : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.taa"></a>

### shaders.taa : <code>string</code>

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.blur"></a>

### shaders.blur : <code>string</code>

Bilateral blur

Depth-aware blur: samples are weighted down as their linear depth diverges
from the center depth, so the blur doesn't bleed across depth discontinuities
(e.g. SSAO around silhouette edges).

One separable pass along `axis`, reaching `radius` pixels either side over
nine taps, as McGuire12 2.4 has it.

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.colorCorrection"></a>

### shaders.colorCorrection : <code>string</code>

Color Correction

https://github.com/CesiumGS/cesium/blob/master/Source/Shaders/Builtin/Functions

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.depthPyramid"></a>

### shaders.depthPyramid : <code>string</code>

Depth pyramid

The linear view-space depth pyramid both screen-space AO estimators sample:
one compute dispatch turning the hardware depth buffer into a mip chain, so a
tap far from its pixel reads a coarse level that is still in cache.

Levels 1..3 reduce through workgroup memory, which is why this is a compute
pass rather than one fullscreen pass per level: the whole chain costs a
single read of the depth buffer.

The reduction filter is the one thing the two estimators disagree on, so it
is an override rather than two copies of the reduction:

- Rotated grid subsampling picks one of each quad's four depths instead of
  combining them, so every level holds a value that was actually in the
  scene. McGuire12 table 1 compares five filters and recommends it.
- The weighted mean biases towards the closest of the four, so a mip keeps a
  thin occluder rather than averaging it into the surface behind it. XeGTAO's
  own choice, and GTAO's falloff parameters are tuned against it.

Paper:
https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf

Requires `depthRead` and `math.saturate`.

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.downsample"></a>

### shaders.downsample : <code>string</code>

Downsample

Neighbor UVs are taken as parameters rather than recomputed from a base UV
and texel size: the composing pipeline computes and interpolates them in the
vertex stage (free via rasterization) instead of paying for the add/multiply
per tap in the fragment stage.

Reference Implementation: https://github.com/keijiro/KinoBloom

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.filmGrain"></a>

### shaders.filmGrain : <code>string</code>

Film Grain

Reference Implementations:

- https://devlog-martinsh.blogspot.com/2013/05/image-imperfections-and-film-grain-post.html
- https://www.shadertoy.com/view/4sSXDW

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.fog"></a>

### shaders.fog : <code>string</code>

Fog

Adapted from from Iñigo Quilez article: https://iquilezles.org/articles/fog/

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.fxaa"></a>

### shaders.fxaa : <code>string</code>

FXAA

Paper:

- https://developer.download.nvidia.com/assets/gamedev/files/sdk/11/FXAA_WhitePaper.pdf

Reference Implementations:

- https://blog.simonrodriguez.fr/articles/2016/07/implementing_fxaa.html
- https://gist.github.com/kosua20/0c506b81b3812ac900048059d2383126

Updates: Damien Seguin (2023-10)

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.reversibleToneMap"></a>

### shaders.reversibleToneMap : <code>string</code>

Reversible Tone Map

Reference Implementations:

- "Optimized Reversible Tonemapper for Resolve", Timothy Lottes:
  https://gpuopen.com/learn/optimized-reversible-tonemapper-for-resolve/

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.sao"></a>

### shaders.sao : <code>string</code>

SAO (Scalable Ambient Obscurance)

Paper:
https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf
(https://casual-effects.com/research/McGuire2012SAO/index.html)

Reference Implementation: G3D's AmbientOcclusion_AO.pix / _minify.pix.

Requires a depth pyramid built with rotated grid subsampling
(`DEPTH_PYRAMID_ROTATED_GRID`): the taps reconstruct through its inverse.

Updates: Marcin Ignac (2017-05-08) and Damien Seguin (2023-10, 2026-09)

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.sky"></a>

### shaders.sky : <code>string</code>

Sky

Based on "A Practical Analytic Model for Daylight" aka The Preetham Model,
the de facto standard analytic skydome model

Paper:
https://www.researchgate.net/publication/220720443_A_Practical_Analytic_Model_for_Daylight

Reference Implementation:

- First implemented by Simon Wallner
  http://www.simonwallner.at/projects/atmospheric-scattering
- Improved by Martins Upitis
  http://blenderartists.org/forum/showthread.php?245954-preethams-sky-impementation-HDR
- Three.js integration by zz85 http://twitter.com/blurspline

Updates: Marcin Ignac http://twitter.com/marcinignac (2015-09) and Damien
Seguin (2023-10)

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.threshold"></a>

### shaders.threshold : <code>string</code>

Threshold

A bright pass on an already brightness-scored color: callers compute exposure
and pick a brightness metric (luma/luminance/average) themselves, since those
already exist as standalone shaders.

Kino/Unity's quadratic soft knee. What passes is the amount _above_ the
threshold, not the whole color scaled by how far above it sits, so a value
crossing the threshold enters from zero instead of arriving at full
brightness. `softKnee` is the half-width of the ramp as a fraction of the
threshold; 0 is a hard cutoff, 0.5 a wide fade.

The knee matters most where content sits at the threshold: without it a value
wobbling by a few percent — a temporal resolve leaves a residual, a thin
line's coverage changes, a circle of confusion is unsteady — swings the whole
cutoff and reads as flicker.

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.upsample"></a>

### shaders.upsample : <code>string</code>

Upsample

Neighbor UVs are taken as parameters rather than recomputed from a base UV
and texel size: the composing pipeline computes and interpolates them in the
vertex stage (free via rasterization) instead of paying for the add/multiply
per tap in the fragment stage.

Reference Implementation: https://github.com/keijiro/KinoBloom

**Kind**: static property of [<code>shaders</code>](#module_shaders)
<a name="module_shaders.noise"></a>

### shaders.noise : <code>object</code>

Reference Implementation: https://github.com/stegu/webgl-noise

Copyright (C) 2011 by Ashima Arts (Simplex noise) Copyright (C) 2011-2016 by
Stefan Gustavson (Classic noise and others)

**Kind**: static constant of [<code>shaders</code>](#module_shaders)
<a name="default"></a>

## default : <code>string</code>

Motion blur reconstruction filter

Tile-based scatter-as-gather: the velocity buffer is reduced to a coarse grid
of dominant motions, each tile takes the largest motion that could reach it
from its neighbours, and every pixel then gathers colour along that motion
weighting each sample by whether it plausibly smeared over the pixel.

Paper: Guertin, McGuire & Nowrouzezahrai, "A Fast and Stable Feature-Aware
Motion Blur Filter", High Performance Graphics 2014 — Appendix A.
https://casual-effects.com/research/Guertin2014MotionBlur/

It builds on the tile framework of McGuire, Hennessy, Bukowski & Osman, "A
Reconstruction Filter for Plausible Motion Blur" (I3D 2012), and differs from
it in the four places that matter: samples alternate between the tile's
dominant motion and the pixel's own so a tile whose neighbours disagree does
not smear in a direction nothing there is moving; the centre sample is
weighted and normalised by the sample count rather than special-cased, which
is what stops thin features ghosting; the depth comparison is relative rather
than scaled by a scene-dependent constant; and diagonal tiles are only
considered when their motion actually points inwards.

Requires `math.saturate` and `depthRead`.

Updates: Damien Seguin (2026-08)

**Kind**: global variable
<a name="default"></a>

## default : <code>string</code>

RCAS (Robust Contrast Adaptive Sharpening)

The sharpening pass from AMD FidelityFX Super Resolution 1.0, which is CAS
reduced to what is safe to run after a resolve: no scaling, and a limiter
derived from the local range so it cannot ring.

Reference:
https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h

Takes its five taps as parameters rather than sampling: the limiter assumes a
roughly [0, 1] signal, so a caller working in HDR has to normalise before it
reaches here and undo that after.

Requires `math.max3`.

Updates: Damien Seguin (2026-08)

**Kind**: global variable
<a name="default"></a>

## default : <code>string</code>

TAA (Temporal Antialiasing)

Accumulates a jittered sequence of frames into one converged image,
reprojecting the previous result through this frame's depth so a moving
camera keeps what it already resolved.

Synthesised from the techniques that make it hold up rather than from one
reference: Karis' tonemapped blend space, reconstruction-filtered current
sample, rounded min/max neighbourhood and history clipping ("High Quality
Temporal Supersampling", SIGGRAPH 2014), Salvi's variance clipping ("An
Excursion in Temporal Supersampling", GDC 2016) widening it where the
neighbourhood understates the real range, and bicubic history resampling.

The two halves of the blend have to describe the same thing for the sequence
to converge: the history is an estimate at the pixel centre, so the current
frame is reconstructed onto the pixel centre before it is mixed in rather
than being taken as the one jittered sample stored there.

Requires `luminance`.

Updates: Damien Seguin (2026-08)

**Kind**: global variable
<a name="multiBounce"></a>

## multiBounce : <code>string</code>

GtaoMultiBounce: Jimenez et al. 2016, "Practical Realtime Strategies for
Accurate Indirect Occlusion"
https://github.com/google/filament/blob/e1dfea0f121f3ee0e552fc010f0dde5ed9c7e783/shaders/src/ambient_occlusion.fs
https://google.github.io/filament/Materials.md.html#materialdefinitions/materialblock/lighting:multibounceambientocclusion
Returns a color ambient occlusion based on a pre-computed visibility term.
The albedo term is meant to be the diffuse color or f0 for the diffuse and
specular terms respectively.

**Kind**: global constant
<a name="specular"></a>

## specular : <code>string</code>

Specular occlusion derived from the diffuse visibility term, after Lagarde
and de Rousiers 2014, "Moving Frostbite to PBR".

Reusing the diffuse visibility for the specular lobe over-occludes a smooth
surface, whose lobe is narrow enough to miss the occluder entirely.

Smoothness in `visibility` matters more here than accuracy. The
cone-intersection alternative (Jimenez et al. 2016 §4.4, using a bent normal)
is sharper in principle, but its aperture goes as `sqrt(1 - visibility)`,
whose derivative is unbounded at full visibility, and for a smooth material
its specular cone is a fraction of a degree wide — so it degenerates into a
step function positioned by the AO term. Fed a screen-space AO buffer sitting
near 1, per-pixel noise far below the visible threshold lands on both sides
of that step and reads as binary speckle on grazing surfaces. This one is
monotone and branchless, and needs no bent normal.

Requires [multiBounce](#multiBounce) for the coloured variant.

**Kind**: global constant
<a name="texture"></a>

## texture : <code>string</code>

The material's occlusion texture read.

**Kind**: global constant
<a name="common"></a>

## common : <code>string</code>

The parameter block. Every other member builds on it, and it is all the
gather needs — that pass works from a prefiltered circle of confusion and
never touches depth.

**Kind**: global constant
<a name="depth"></a>

## depth : <code>string</code>

Linear depth, in the millimetres the thin lens model works in. Requires
[common](#common) and `depthRead`.

**Kind**: global constant
<a name="coc"></a>

## coc : <code>string</code>

Circle of confusion from depth, under either model. Requires [common](#common),
and [depth](#depth) for the callers that read it off the depth buffer.

**Kind**: global constant
<a name="focus"></a>

## focus : <code>string</code>

Autofocus: the distance the frame focuses at, read off a screen point.
Requires [common](#common) and [depth](#depth).

**Kind**: global constant
<a name="resolve"></a>

## resolve : <code>string</code>

Temporal resolve of the circle of confusion, which a jittered raster needs
before anything prefilters it. Requires [common](#common), [depth](#depth) and
[coc](#coc).

**Kind**: global constant
<a name="downsample"></a>

## downsample : <code>string</code>

The prefilter's mip chain, and the bilateral weight it shares with the
prefilter itself. Needs neither depth nor the parameters — a level is a
filter over colour and a circle of confusion that are already computed.
Requires `math.saturate`.

**Kind**: global constant
<a name="prefilter"></a>

## prefilter : <code>string</code>

Half-resolution colour and circle of confusion in one texture. Requires
[common](#common), [depth](#depth), [coc](#coc), [downsample](#downsample), `math.saturate`,
`luma` and `threshold`.

**Kind**: global constant
<a name="tiles"></a>

## tiles : <code>string</code>

The coarse grid that bounds the near field's search, and its dilation.
Standalone, like [downsample](#downsample).

**Kind**: global constant
<a name="gather"></a>

## gather : <code>string</code>

The two fields, each gathered over the span it actually needs. Requires
[common](#common), `math.PI`, `math.TWO_PI` and `math.saturate`.

**Kind**: global constant
<a name="postFilter"></a>

## postFilter : <code>string</code>

The near field's post filter: a median that rejects the speckle a dithered
gather leaves along a silhouette. Requires `luma`.

**Kind**: global constant
<a name="composite"></a>

## composite : <code>string</code>

The two fields over the sharp image, at full resolution, and the debug view.
Requires [common](#common) and `math.saturate`.

**Kind**: global constant
<a name="common"></a>

## common : <code>string</code>

Constants, parameters and the helpers both passes share. Requires `math.PI`,
`math.HALF_PI`, `math.saturate` and `depthRead`.

**Kind**: global constant
<a name="main"></a>

## main : <code>string</code>

The estimator: a horizon search over `GTAO_NUM_SLICES` slices of
`GTAO_NUM_STEPS_PER_SLICE` steps, producing visibility, a bent normal under
`USE_GTAO_BENT_NORMALS`, and the edge weights the denoiser needs. Requires
[common](#common), `depthPyramid` and `colorCorrection`.

**Kind**: global constant
<a name="denoise"></a>

## denoise : <code>string</code>

Edge-aware denoiser. Averages a 3x3 neighbourhood weighted by the estimator's
edges, so occlusion never crosses a depth discontinuity. `finalApply`
restores the UNORM scale and renormalises the bent normal, and belongs on the
last pass only. Requires [common](#common) and [main](#main).

**Kind**: global constant
<a name="common"></a>

## common : <code>string</code>

Parameters, the optical centre remappings and the spectral sweep every family
samples through. Requires `math.TWO_PI`.

**Kind**: global constant
<a name="ghosts"></a>

## ghosts : <code>string</code>

Ghosts: the aperture imaged by pairs of internal reflections, scaled about
the optical centre. Requires [common](#common).

**Kind**: global constant
<a name="halo"></a>

## halo : <code>string</code>

Halo: everything at a fixed distance from the optical axis, brought to the
same radius. Requires [common](#common).

**Kind**: global constant
<a name="streak"></a>

## streak : <code>string</code>

Streaks: the diaphragm's diffraction spikes, as one directional blur chain
per spike axis. Requires [common](#common).

Every direction lives in one texture, as a horizontal band. The chains have
to stay separate — blurring a spike along another spike's axis thickens it
into a blob rather than crossing it — but they are the same filter with a
different vector, so banding them keeps the chain at one pass per iteration
whatever the blade count, instead of one per iteration per direction.

**Kind**: global constant
<a name="common"></a>

## common : <code>string</code>

Quality preset and shared helpers. Required by all three passes.

The preset overrides map to the reference's SMAA_PRESET_* blocks: low/medium
disable diagonal and corner detection outright.

**Kind**: global constant
<a name="edges"></a>

## edges : <code>string</code>

Pass 1: edge detection. Writes the left/top edge pair, and discards where
there is none — the stencil-like early out the reference relies on.

Requires [common](#common) and, for the color and luma variants, the encodeDecode
chunk.

**Kind**: global constant
<a name="weights"></a>

## weights : <code>string</code>

Pass 2: blending weight calculation. Searches the edge buffer for the
distance to each line end, then looks up the precomputed coverage area.

Requires [common](#common).

**Kind**: global constant
<a name="blend"></a>

## blend : <code>string</code>

Pass 3: neighborhood blending. Mixes the pixel with the neighbor its blending
weight points at, exploiting bilinear filtering to do it in one tap per
direction.

Requires [common](#common).

**Kind**: global constant
<a name="ambientOcclusion"></a>

## .ambientOcclusion : <code>object</code>

Ambient Occlusion

Split into parts because its two consumers share only the multi-bounce model:
the material shader needs the texture read (and with it PBRData),
post-processing needs the screen-space mix.

**Kind**: static member
<a name="depthOfField"></a>

## .depthOfField : <code>object</code>

Depth of Field

Tile-based scatter-as-gather at half resolution, near and far fields
separated: prefilter colour and circle of confusion together, reduce the
circle of confusion to a coarse grid, gather each field over the span it
needs, composite back at full resolution.

The arrangement production depth of field converged on — Jimenez, "Next
Generation Post Processing in Call of Duty: Advanced Warfare" (SIGGRAPH
2014), Unity's HDRP, AMD's FidelityFX Depth of Field. The reasons are
structural rather than about cost:

- **Scatter as gather.** Testing per tap whether _that tap's_ disc reaches here
  means an in-focus pixel has no disc and cannot leak onto a defocused
  neighbour, and normalising by the weights that did reach reconstructs the
  background behind a foreground object. A tap's weight is the inverse of its
  own disc area, which is the half of scattering a gather otherwise loses:
  what a source delivers per destination is what makes a near field cover its
  own disc rather than everything the tile can see.
- **Near and far are different problems.** The far field composites by the
  destination's own defocus, the near field by its own coverage. One image
  cannot carry both.
- **Tiles bound the near search.** A foreground scatters in from wherever it
  is, so only the neighbourhood knows how far to look. The far field's limit
  is the destination's own defocus instead.
- **The highlight boost belongs in the prefilter.** Per tap it is computed per
  destination, so one bright source is boosted differently by every pixel
  gathering it and the disc redraws itself as the image moves.

Circles of confusion are signed and in half-resolution pixels of radius
throughout: positive in front of the focal plane, negative behind it.
Distances are millimetres, the unit the thin lens model works in.

Split into the passes rather than shipped whole, since most of them share
only the parameter block: the tile reduction and the mip chain touch neither
depth nor a circle of confusion, and the post filter needs no more than a
luminance. Each member names what it requires.

Sources

Pinned, and every claim below names the symbol it comes from.

- Jorge Jimenez, "Next Generation Post Processing in Call of Duty: Advanced
  Warfare", SIGGRAPH 2014.
  https://advances.realtimerendering.com/s2014/index.html Scatter as gather
  at half resolution, the near and far fields as separate images, and the
  coarse grid that bounds the near search.
- AMD FidelityFX Depth of Field v1.1.2, `ffx_dof_blur.h`,
  `ffx_dof_downsample_color.h`, `ffx_dof_composite.h`.
  https://github.com/GPUOpen-LibrariesAndSDKs/FidelityFX-SDK/tree/v1.1.2/sdk/include/FidelityFX/gpu/dof
  The arrangement here, closest of the four: one gather pass feeding both
  fields, a mip chain that carries one texel's radius per block while
  filtering colour bilaterally against it (`FfxDofDownsampleQuadH`), the
  inverse-disc-area sample weight (`FfxDofWeight`, written there as
  `1/(4r^2)` for speed where this uses the real pi), the near coverage that
  normalises against it (`fgOpacity`, `acc.nearColor.a / (FfxDofWeight(coc =
tileCoc) * nSamples)`, taken as it is), the outside-in ring bucket ordering
  and the annulus-overlap geometry of the merge (`FfxDofMergeBuckets` — the
  geometry only; how full the occluding band is comes from HDRP, below),
  per-tile radii, one integer mip level for the whole kernel
  (`FfxDofSampleInput`), and the cubic the near field is composited through
  (`FfxCubicSpline`).
- Unity HDRP. Two depth of field implementations live in that one folder and
  this borrows from both; they are not one algorithm, and a symbol from one
  will not be found in the other.
  https://github.com/Unity-Technologies/Graphics/tree/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Runtime/PostProcessing/Shaders
  Physically based path, the `DoF*` files — `DoFGatherUtils.hlsl`,
  `DoFCoCMinMax.compute`, `DoFGather.compute`: the far field's search bounded
  by the destination's own defocus (`LoadTileData`, `limit = min(maxFarCoC, 2
  - abs(centerSample.CoC))` — the factor of two deliberately not carried
over, see below), the ring occlusion measured by weight rather than by
sample count (`ringOpacity`, and the early return on a ring that carries
none — see `occluding` in [gather](#gather) for why the count is the wrong
measure), a tile carrying each field's smallest radius alongside its
largest with a sentinel for a field it does not hold (`InitMinMaxTile`,
`BIG_NUMBER` 1200), and the ring count scaled by how uniform the tile is
(`ADAPTIVE_SAMPLING`, direction inverted here — see below). Classic path,
the `DepthOfField*`files —`DepthOfFieldGather.compute`: near and far as
separate kernels over separate spans (`KMainNear`, `KMainFar`), and a near
coverage ramped by `smoothstep`before use. Common to both: a radius loaded
unfiltered while colour is sampled filtered, and a near gather that reads
the chain at`mip = 0.0` because a coarse level cannot describe a
    silhouette.
- Unity post-processing stack v2,
  `PostProcessing/Shaders/Builtins/DepthOfField.hlsl`.
  https://github.com/Unity-Technologies/PostProcessing/blob/v2/PostProcessing/Shaders/Builtins/DepthOfField.hlsl
  `bgCoC = max(min(samp0.a, samp.a), 0)` against `fgWeight`: the far field
  tests the destination's own defocus, the near field the tap's own. Sign
  convention there, and in both HDRP paths, is the opposite of this one —
  near is negative in all three, positive here.

Deviations

Ordered by what depends on what. The first is structural and most of the rest
follow from it.

- **Ring occlusion is a hybrid, deliberately.** The bucket ordering and the
  annulus geometry are FidelityFX's; how much the occluding band attenuates
  is HDRP's `ringOpacity`, the weight it carries over the weight a full ring
  at its own radius would. FidelityFX uses the sample count
  (`currBucket.sampleCount / ringSamples`), which charges for taps that reach
  nothing: an in-focus surface, or a background too near the focal plane to
  span the distance, carries no colour and is already absent from the
  normalisation. Measured against a sharp occluder, where the correct
  contribution is zero, the count form rims the silhouette with a band as
  wide as two thirds of the gather and inverts sign across it; the weighted
  form measures zero. Where occlusion belongs — two backgrounds at different
  depths — the weighted form still acts, and its reach follows the front
  layer's own radius instead of ignoring it.
- **A kernel per field, inside one pass.** FidelityFX runs one kernel sized to
  `max(nearTile, farTile)` and uses it for both loops (`ffx_dof_blur.h`,
  `tileRad`, `ins.tileCoc`); HDRP's physically based path does the same.
  HDRP's classic path gives each field its own span but pays for it with a
  dispatch each (`DepthOfFieldGather.compute`, `KMainNear` and `KMainFar`).
  This takes the classic path's spans and FidelityFX's single pass. Sharing a
  kernel makes a foreground sharper than the background behind it fall off in
  plateaus one ring apart, because its whole disc gets the two or three
  innermost rings of a kernel sized for something else. What it costs: both
  fields draw on one ring budget, where the two-pass form would size them
  separately.
- **The near field's span is the dilated tile, the far field's is the pixel's
  own defocus.** Not a deviation — `DepthOfFieldGather.compute` reads
  `_InputDilatedCoCTexture` under `NEAR` and `_InputCoCTexture` under `FAR`.
  What is not carried over is the physically based path's `limit =
min(maxFarCoC, 2 * abs(centerSample.CoC))` (`LoadTileData`), and only
  because the factor of two means something different there: with one shared
  kernel the far span decides which taps are accepted, so widening it costs
  nothing; here it is the kernel radius, so doubling it would put half the
  rings in an annulus the acceptance test is about to reject anyway.
- **`ringGap` is not carried over, and the mip level is rounded up.** It
  feathers FidelityFX's acceptance test over the pixels an under-sampled
  kernel steps across. It is near enough free there because their cap never
  binds — the sample ships `quality = 10` rings against a `cocLimit` of `0.5
  - 0.01 * 1080`, so about 5.4 pixels of radius and 6 rings asked of 10. Here
the cap binds routinely, and a feather that widens with the gap over-covers
badly. Rounding the level up closes the same gap. The near field keeps
FidelityFX's half pixel (`rangeThreshNear`). The far field takes a whole
one where they take none, which the clamp below forces: see
`DOF_FAR_FEATHER` in [gather](#gather).
- **Adaptive sampling runs the other way.** HDRP's mechanism is
  `lerp(AdaptiveSamplingWeights.xy, minRadius / maxRadius)`, and the pipeline
  packs that vector as `(min(w, 1), max(w, 1))` with `w` defaulting to 0.75 —
  so by default a mixed tile gets _fewer_ samples and only a uniform one can
  be given more. This spends the extra rings on the mixed tile instead, which
  is where the near coverage measurably follows the tile grid. See
  `DOF_RING_SCALE` in [gather](#gather) for the numbers and the caveat. The
  direction only matters because the cap binds, above.
- **The far field carries no edge expansion.** Both this and FidelityFX
  normalise the far field in the gather (`ffTarget = acc.prevBucket.color /
acc.prevBucket.color.a`), so the stored alpha is one wherever the field has
  content. Bilinear upsampling at the composite then mixes written texels
  with unwritten ones, which FidelityFX repairs by dividing through the
  interpolated alpha a second time (`ffx_dof_composite.h`, "expand background
  around edges"). Here the unwritten texel is seeded with the sharp colour
  instead, so the same boundary interpolates towards the image rather than
  towards nothing. Cheaper, and one fewer divide; slightly under-weights the
  far field over the one texel where the two blend.
- **The transition blur scales with the circle of confusion.** FidelityFX
  crossfades to a fixed-width 3x3 (`FfxDofBlur3x3`, coefficients 0.5453 and
  0.9717) over the same two handovers this uses (`c1`, `c2` there;
  `toTransition`, `toField` here). Four bilinear taps that widen with the
  radius track the growth of the disc across the range where neither the
  sharp image nor a half-resolution gather describes it, at the cost of not
  being a fixed kernel.

**Kind**: static member
<a name="gtao"></a>

## .gtao : <code>object</code>

GTAO (Ground Truth Ambient Occlusion)

Paper:
https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf

Reference Implementation:
https://github.com/GameTechDev/XeGTAO/blob/master/Source/Rendering/Shaders/XeGTAO.hlsli

Split into the three passes the technique needs, since they share only the
constants, the estimator, and the edge-aware denoiser. The depth pyramid the
estimator samples is built by the shared `depthPyramid` chunk.

Two conventions differ from the reference and everything else follows from
them. View space here is right-handed with -Z forward, where XeGTAO's is
left-handed; only the bent normal's construction frame notices, the rest
being dot and cross products among consistently-signed vectors. And screen
coordinates are WebGPU's, with V pointing down, which the vertical terms of
`ndcToViewMul`/`ndcToViewAdd` and the slice direction's `omega` carry the
sign for.

Updates: Damien Seguin (2023-10, 2026-08)

**Kind**: static member
<a name="lensFlare"></a>

## .lensFlare : <code>object</code>

Lens Flare

Image-based flare: a bright pass resampled through the optical centre. Three
families, all of them the same image read at a different coordinate — ghosts
(the aperture imaged by a pair of internal reflections), a halo (the ring a
source at a fixed distance from the axis draws), and streaks (the diaphragm's
diffraction spikes).

The arrangement Unity's HDRP screen space lens flare uses, which is Chapman's
"Pseudo Lens Flare" (2013) with the ring family added. The physically-based
tier — Hullin et al. (SIGGRAPH 2011), Lee and Eisemann (EGSR 2013) — traces
rays through an actual lens prescription and needs both a light list and a
description of the optics, so it is not a post-process at all. What this
borrows from it is where the numbers come from rather than how they are
drawn: the optical centre is the projection's principal point, dispersion is
lateral (it grows with distance from the axis and vanishes on it), and the
streak directions are the diaphragm's, not an artist's.

Split into the families rather than shipped whole, since a scene that wants
only a starburst has no reason to compile the ghost loop: they share the
parameter block and the spectral sweep, and nothing else.

Coordinates are UV throughout. `aspect` maps a UV delta into a square space
and back, so a distance that should be measured on screen — the halo radius,
a streak angle — is not silently measured in a stretched one.

Sources

- John Chapman, "Pseudo Lens Flare" (2013).
  https://john-chapman.github.io/2017/11/05/pseudo-lens-flare.html The ghost
  and halo formulation below: resample one bright pass through the optical
  centre instead of drawing sprites at a projected light position.
- Unity, "Screen Space Lens Flare" (HDRP/URP 14+).
  https://github.com/Unity-Technologies/Graphics/blob/master/Packages/com.unity.render-pipelines.core/Runtime/PostProcessing/Shaders/LensFlareScreenSpaceCommon.hlsl
  Chapman plus the polar family, the spectral sweep and the streak chain.
  `scaleUV`, `GetFlareTexture` and `FragmentComposition` are the functions
  these correspond to.
- Froyok (Lena Piquet), "Custom Lens-Flare in UE4" (2021).
  https://www.froyok.fr/blog/2021-09-ue4-custom-lens-flare/ Why the ghosts
  read a blurred bright pass rather than a raw one.
- Masaki Kawase, "Frame Buffer Postprocessing Effects in DOUBLE-S.T.E.A.L", GDC 2003. http://www.daionet.gr.jp/~masa/archives/GDC2003_DSTEAL.ppt The streak
  filter: a few taps per pass, stride growing geometrically.
- Hullin et al., "Physically-Based Real-Time Lens Flare Rendering", SIGGRAPH 2011. doi:10.1145/2010324.1964936
- Lee and Eisemann, "Practical Real-Time Lens-Flare Rendering", EGSR 2013.
  doi:10.1111/cgf.12145 The two above trace rays through a lens prescription
  and need a light list as well as the optics, so neither is a post-process.
  What this borrows from them is where the numbers come from: the optical
  centre is the projection's principal point, dispersion is lateral, and the
  streak axes are the diaphragm's.

**Kind**: static member
<a name="smaa"></a>

## .smaa : <code>object</code>

SMAA (Enhanced Subpixel Morphological Antialiasing) 1x

Paper: http://www.iryoku.com/smaa/

Reference Implementations:

- https://github.com/iryoku/smaa (SMAA.hlsl)
- https://github.com/dmnsgn/glsl-smaa

Ported to WGSL keeping the reference's top-left texture origin, which WebGPU
shares: the GLSL port had to flip the search texture on upload to compensate
for GL's bottom-left origin, and this one must not.

The three parts map to the three passes: edge detection, blending weight
calculation against the precomputed area/search textures, and neighborhood
blending. Every function takes its textures and texel size as parameters —
shaders declare no bindings.

**Kind**: static member

<!-- api-end -->

## License

MIT. See [license file](https://github.com/pex-gl/pex-shaders/blob/main/LICENSE.md).
