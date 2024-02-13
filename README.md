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
<dt><a href="#module_parser">parser</a></dt>
<dd></dd>
<dt><a href="#module_chunks">chunks</a></dt>
<dd></dd>
<dt><a href="#module_pipeline">pipeline</a></dt>
<dd></dd>
<dt><a href="#module_postProcessing">postProcessing</a></dt>
<dd></dd>
<dt><a href="#module_reflectionProbe">reflectionProbe</a></dt>
<dd></dd>
<dt><a href="#module_skybox">skybox</a></dt>
<dd></dd>
</dl>

<a name="module_pex-shaders"></a>

## pex-shaders

- [pex-shaders](#module_pex-shaders)
  - [.chunks](#module_pex-shaders.chunks) : [<code>chunks</code>](#module_chunks)
  - [.pipeline](#module_pex-shaders.pipeline) : [<code>pipeline</code>](#module_pipeline)
  - [.postProcessing](#module_pex-shaders.postProcessing) : [<code>postProcessing</code>](#module_postProcessing)
  - [.reflectionProbe](#module_pex-shaders.reflectionProbe) : [<code>reflectionProbe</code>](#module_reflectionProbe)
  - [.skybox](#module_pex-shaders.skybox) : [<code>skybox</code>](#module_skybox)
  - [.parser](#module_pex-shaders.parser) : [<code>parser</code>](#module_parser)
  - [.toneMap](#module_pex-shaders.toneMap) : <code>object</code>

<a name="module_pex-shaders.chunks"></a>

### pex-shaders.chunks : [<code>chunks</code>](#module_chunks)

Various shader chunks to be inserted in main shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.pipeline"></a>

### pex-shaders.pipeline : [<code>pipeline</code>](#module_pipeline)

Main shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.postProcessing"></a>

### pex-shaders.postProcessing : [<code>postProcessing</code>](#module_postProcessing)

Post-processing shaders that operate on fullscreen

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.reflectionProbe"></a>

### pex-shaders.reflectionProbe : [<code>reflectionProbe</code>](#module_reflectionProbe)

Reflection probes specific shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.skybox"></a>

### pex-shaders.skybox : [<code>skybox</code>](#module_skybox)

Skybox specific shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.parser"></a>

### pex-shaders.parser : [<code>parser</code>](#module_parser)

Shader string manipulation helpers

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.toneMap"></a>

### pex-shaders.toneMap : <code>object</code>

Re-export tone mapping functions

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
**See**: [https://github.com/dmnsgn/glsl-tone-map](https://github.com/dmnsgn/glsl-tone-map)
<a name="module_parser"></a>

## parser

- [parser](#module_parser)
  - [.GLSL3](#module_parser.GLSL3)
  - [.formatExtensions([extensions])](#module_parser.formatExtensions) ⇒ <code>string</code>
  - [.formatDefines([defines])](#module_parser.formatDefines) ⇒ <code>string</code>
  - [.build(ctx, src, [defines], [extensions])](#module_parser.build) ⇒ <code>string</code>
  - [.patchES300(src, stage)](#module_parser.patchES300) ⇒ <code>string</code>
  - [.replaceStrings(src, options)](#module_parser.replaceStrings) ⇒ <code>string</code>
  - [.getFormattedError(error, options)](#module_parser.getFormattedError) ⇒ <code>string</code>

<a name="module_parser.GLSL3"></a>

### parser.GLSL3

GLSL 3 preprocessor version string

**Kind**: static constant of [<code>parser</code>](#module_parser)
<a name="module_parser.formatExtensions"></a>

### parser.formatExtensions([extensions]) ⇒ <code>string</code>

Format an object of extension names as key and extension behaviosr (enable/require/warn/disable) as value

**Kind**: static method of [<code>parser</code>](#module_parser)

| Param        | Type                | Default         |
| ------------ | ------------------- | --------------- |
| [extensions] | <code>object</code> | <code>{}</code> |

<a name="module_parser.formatDefines"></a>

### parser.formatDefines([defines]) ⇒ <code>string</code>

Format an array of define keys

**Kind**: static method of [<code>parser</code>](#module_parser)

| Param     | Type                              | Default         |
| --------- | --------------------------------- | --------------- |
| [defines] | <code>Array.&lt;string&gt;</code> | <code>[]</code> |

<a name="module_parser.build"></a>

### parser.build(ctx, src, [defines], [extensions]) ⇒ <code>string</code>

Add version string and format a list of defines for a shader source

**Kind**: static method of [<code>parser</code>](#module_parser)

| Param        | Type                              | Default         |
| ------------ | --------------------------------- | --------------- |
| ctx          | <code>ctx</code>                  |                 |
| src          | <code>string</code>               |                 |
| [defines]    | <code>Array.&lt;string&gt;</code> | <code>[]</code> |
| [extensions] | <code>object</code>               | <code>{}</code> |

<a name="module_parser.patchES300"></a>

### parser.patchES300(src, stage) ⇒ <code>string</code>

Monkey patch a shader string for ES300 by replacing builtin keywords and un-necessary extensions, and adding the version preprocessor string

**Kind**: static method of [<code>parser</code>](#module_parser)

| Param | Type                                                                 |
| ----- | -------------------------------------------------------------------- |
| src   | <code>string</code>                                                  |
| stage | <code>&quot;vertex&quot;</code> \| <code>&quot;fragment&quot;</code> |

<a name="module_parser.replaceStrings"></a>

### parser.replaceStrings(src, options) ⇒ <code>string</code>

Unroll loops (looped preceded by "#pragma unroll_loop") for lights and replace their constant iterators

**Kind**: static method of [<code>parser</code>](#module_parser)

| Param   | Type                |
| ------- | ------------------- |
| src     | <code>string</code> |
| options | <code>object</code> |

<a name="module_parser.getFormattedError"></a>

### parser.getFormattedError(error, options) ⇒ <code>string</code>

Get a formatted error pointing at the issue line

**Kind**: static method of [<code>parser</code>](#module_parser)

| Param   | Type                |
| ------- | ------------------- |
| error   | <code>Error</code>  |
| options | <code>Object</code> |

<a name="module_chunks"></a>

## chunks

- [chunks](#module_chunks)
  - [.output](#module_chunks.output) : <code>object</code>
  - [.math](#module_chunks.math) : <code>object</code>
  - [.encodeDecode](#module_chunks.encodeDecode) : <code>string</code>
  - [.luma](#module_chunks.luma) : <code>string</code>
  - [.lightAmbient](#module_chunks.lightAmbient) : <code>string</code>
  - [.lightDirectional](#module_chunks.lightDirectional) : <code>string</code>
  - [.lightPoint](#module_chunks.lightPoint) : <code>string</code>
  - [.lightSpot](#module_chunks.lightSpot) : <code>string</code>
  - [.lightArea](#module_chunks.lightArea) : <code>string</code>
  - [.shadowing](#module_chunks.shadowing) : <code>string</code>
  - [.brdf](#module_chunks.brdf) : <code>string</code>
  - [.direct](#module_chunks.direct) : <code>string</code>
  - [.indirect](#module_chunks.indirect) : <code>string</code>
  - [.envMapEquirect](#module_chunks.envMapEquirect) : <code>string</code>
  - [.octMap](#module_chunks.octMap) : <code>string</code>
  - [.octMapUvToDir](#module_chunks.octMapUvToDir) : <code>string</code>
  - [.irradiance](#module_chunks.irradiance) : <code>string</code>
  - [.textureCoordinates](#module_chunks.textureCoordinates) : <code>string</code>
  - [.baseColor](#module_chunks.baseColor) : <code>string</code>
  - [.emissiveColor](#module_chunks.emissiveColor) : <code>string</code>
  - [.normal](#module_chunks.normal) : <code>string</code>
  - [.normalPerturb](#module_chunks.normalPerturb) : <code>string</code>
  - [.metallicRoughness](#module_chunks.metallicRoughness) : <code>string</code>
  - [.specularGlossiness](#module_chunks.specularGlossiness) : <code>string</code>
  - [.clearCoat](#module_chunks.clearCoat) : <code>string</code>
  - [.sheenColor](#module_chunks.sheenColor) : <code>string</code>
  - [.alpha](#module_chunks.alpha) : <code>string</code>
  - [.ambientOcclusion](#module_chunks.ambientOcclusion) : <code>string</code>
  - [.depthRead](#module_chunks.depthRead) : <code>string</code>
  - [.depthPosition](#module_chunks.depthPosition) : <code>string</code>
  - [.depthUnpack](#module_chunks.depthUnpack) : <code>string</code>
  - [.depthPack](#module_chunks.depthPack) : <code>string</code>
  - [.lut](#module_chunks.lut) : <code>string</code>
  - [.vignette](#module_chunks.vignette) : <code>string</code>
  - [.colorCorrection](#module_chunks.colorCorrection) : <code>string</code>
  - [.filmGrain](#module_chunks.filmGrain) : <code>string</code>
  - [.fog](#module_chunks.fog) : <code>string</code>
  - [.fxaa](#module_chunks.fxaa) : <code>string</code>
  - [.noise](#module_chunks.noise) : <code>object</code>

<a name="module_chunks.output"></a>

### chunks.output : <code>object</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.math"></a>

### chunks.math : <code>object</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.encodeDecode"></a>

### chunks.encodeDecode : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.luma"></a>

### chunks.luma : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.lightAmbient"></a>

### chunks.lightAmbient : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.lightDirectional"></a>

### chunks.lightDirectional : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.lightPoint"></a>

### chunks.lightPoint : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.lightSpot"></a>

### chunks.lightSpot : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.lightArea"></a>

### chunks.lightArea : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.shadowing"></a>

### chunks.shadowing : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.brdf"></a>

### chunks.brdf : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.direct"></a>

### chunks.direct : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.indirect"></a>

### chunks.indirect : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.envMapEquirect"></a>

### chunks.envMapEquirect : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.octMap"></a>

### chunks.octMap : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.octMapUvToDir"></a>

### chunks.octMapUvToDir : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.irradiance"></a>

### chunks.irradiance : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.textureCoordinates"></a>

### chunks.textureCoordinates : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.baseColor"></a>

### chunks.baseColor : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.emissiveColor"></a>

### chunks.emissiveColor : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.normal"></a>

### chunks.normal : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.normalPerturb"></a>

### chunks.normalPerturb : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.metallicRoughness"></a>

### chunks.metallicRoughness : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.specularGlossiness"></a>

### chunks.specularGlossiness : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.clearCoat"></a>

### chunks.clearCoat : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.sheenColor"></a>

### chunks.sheenColor : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.alpha"></a>

### chunks.alpha : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.ambientOcclusion"></a>

### chunks.ambientOcclusion : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.depthRead"></a>

### chunks.depthRead : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.depthPosition"></a>

### chunks.depthPosition : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.depthUnpack"></a>

### chunks.depthUnpack : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.depthPack"></a>

### chunks.depthPack : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.lut"></a>

### chunks.lut : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.vignette"></a>

### chunks.vignette : <code>string</code>

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.colorCorrection"></a>

### chunks.colorCorrection : <code>string</code>

Color Correction

https://github.com/CesiumGS/cesium/blob/master/Source/Shaders/Builtin/Functions

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.filmGrain"></a>

### chunks.filmGrain : <code>string</code>

Film Grain

Reference Implementations:

- https://devlog-martinsh.blogspot.com/2013/05/image-imperfections-and-film-grain-post.html
- https://www.shadertoy.com/view/4sSXDW

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.fog"></a>

### chunks.fog : <code>string</code>

Fog

Adapted from from Iñigo Quilez article: https://iquilezles.org/articles/fog/

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.fxaa"></a>

### chunks.fxaa : <code>string</code>

FXAA

Paper:

- https://developer.download.nvidia.com/assets/gamedev/files/sdk/11/FXAA_WhitePaper.pdf

Reference Implementations:

- v3.11: https://github.com/FyroxEngine/Fyrox/blob/master/src/renderer/shaders/fxaa_fs.glsl
- v2: https://github.com/mattdesl/glsl-fxaa

Updates: Damien Seguin (2023-10)

**Kind**: static property of [<code>chunks</code>](#module_chunks)
<a name="module_chunks.noise"></a>

### chunks.noise : <code>object</code>

Reference Implementation: https://github.com/stegu/webgl-noise

Copyright (C) 2011 by Ashima Arts (Simplex noise)
Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)

**Kind**: static constant of [<code>chunks</code>](#module_chunks)
<a name="module_pipeline"></a>

## pipeline

- [pipeline](#module_pipeline)
  - [.blit](#module_pipeline.blit) : <code>object</code>
    - [.frag](#module_pipeline.blit.frag) : <code>string</code>
    - [.vert](#module_pipeline.blit.vert) : <code>string</code>
  - [.depthPass](#module_pipeline.depthPass) : <code>object</code>
    - [.frag](#module_pipeline.depthPass.frag) : <code>string</code>
    - [.vert](#module_pipeline.depthPass.vert) : <code>string</code>
  - [.depthPrePass](#module_pipeline.depthPrePass) : <code>object</code>
    - [.frag](#module_pipeline.depthPrePass.frag) : <code>string</code>
  - [.standard](#module_pipeline.standard) : <code>object</code>
    - [.frag](#module_pipeline.standard.frag) : <code>string</code>
    - [.vert](#module_pipeline.standard.vert) : <code>string</code>
  - [.basic](#module_pipeline.basic) : <code>object</code>
    - [.frag](#module_pipeline.basic.frag) : <code>string</code>
    - [.vert](#module_pipeline.basic.vert) : <code>string</code>
  - [.line](#module_pipeline.line) : <code>object</code>
    - [.frag](#module_pipeline.line.frag) : <code>string</code>
    - [.vert](#module_pipeline.line.vert) : <code>string</code>
  - [.overlay](#module_pipeline.overlay) : <code>object</code>
    - [.frag](#module_pipeline.overlay.frag) : <code>string</code>
    - [.vert](#module_pipeline.overlay.vert) : <code>string</code>
  - [.helper](#module_pipeline.helper) : <code>object</code>
    - [.frag](#module_pipeline.helper.frag) : <code>string</code>
    - [.vert](#module_pipeline.helper.vert) : <code>string</code>
  - [.error](#module_pipeline.error) : <code>object</code>
    - [.frag](#module_pipeline.error.frag) : <code>string</code>
    - [.vert](#module_pipeline.error.vert) : <code>string</code>

<a name="module_pipeline.blit"></a>

### pipeline.blit : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)

- [.blit](#module_pipeline.blit) : <code>object</code>
  - [.frag](#module_pipeline.blit.frag) : <code>string</code>
  - [.vert](#module_pipeline.blit.vert) : <code>string</code>

<a name="module_pipeline.blit.frag"></a>

#### blit.frag : <code>string</code>

**Kind**: static property of [<code>blit</code>](#module_pipeline.blit)
<a name="module_pipeline.blit.vert"></a>

#### blit.vert : <code>string</code>

**Kind**: static property of [<code>blit</code>](#module_pipeline.blit)
<a name="module_pipeline.depthPass"></a>

### pipeline.depthPass : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)

- [.depthPass](#module_pipeline.depthPass) : <code>object</code>
  - [.frag](#module_pipeline.depthPass.frag) : <code>string</code>
  - [.vert](#module_pipeline.depthPass.vert) : <code>string</code>

<a name="module_pipeline.depthPass.frag"></a>

#### depthPass.frag : <code>string</code>

**Kind**: static property of [<code>depthPass</code>](#module_pipeline.depthPass)
<a name="module_pipeline.depthPass.vert"></a>

#### depthPass.vert : <code>string</code>

**Kind**: static property of [<code>depthPass</code>](#module_pipeline.depthPass)
<a name="module_pipeline.depthPrePass"></a>

### pipeline.depthPrePass : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)
<a name="module_pipeline.depthPrePass.frag"></a>

#### depthPrePass.frag : <code>string</code>

**Kind**: static property of [<code>depthPrePass</code>](#module_pipeline.depthPrePass)
<a name="module_pipeline.standard"></a>

### pipeline.standard : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)

- [.standard](#module_pipeline.standard) : <code>object</code>
  - [.frag](#module_pipeline.standard.frag) : <code>string</code>
  - [.vert](#module_pipeline.standard.vert) : <code>string</code>

<a name="module_pipeline.standard.frag"></a>

#### standard.frag : <code>string</code>

**Kind**: static property of [<code>standard</code>](#module_pipeline.standard)
<a name="module_pipeline.standard.vert"></a>

#### standard.vert : <code>string</code>

**Kind**: static property of [<code>standard</code>](#module_pipeline.standard)
<a name="module_pipeline.basic"></a>

### pipeline.basic : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)

- [.basic](#module_pipeline.basic) : <code>object</code>
  - [.frag](#module_pipeline.basic.frag) : <code>string</code>
  - [.vert](#module_pipeline.basic.vert) : <code>string</code>

<a name="module_pipeline.basic.frag"></a>

#### basic.frag : <code>string</code>

**Kind**: static property of [<code>basic</code>](#module_pipeline.basic)
<a name="module_pipeline.basic.vert"></a>

#### basic.vert : <code>string</code>

**Kind**: static property of [<code>basic</code>](#module_pipeline.basic)
<a name="module_pipeline.line"></a>

### pipeline.line : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)

- [.line](#module_pipeline.line) : <code>object</code>
  - [.frag](#module_pipeline.line.frag) : <code>string</code>
  - [.vert](#module_pipeline.line.vert) : <code>string</code>

<a name="module_pipeline.line.frag"></a>

#### line.frag : <code>string</code>

**Kind**: static property of [<code>line</code>](#module_pipeline.line)
<a name="module_pipeline.line.vert"></a>

#### line.vert : <code>string</code>

**Kind**: static property of [<code>line</code>](#module_pipeline.line)
<a name="module_pipeline.overlay"></a>

### pipeline.overlay : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)

- [.overlay](#module_pipeline.overlay) : <code>object</code>
  - [.frag](#module_pipeline.overlay.frag) : <code>string</code>
  - [.vert](#module_pipeline.overlay.vert) : <code>string</code>

<a name="module_pipeline.overlay.frag"></a>

#### overlay.frag : <code>string</code>

**Kind**: static property of [<code>overlay</code>](#module_pipeline.overlay)
<a name="module_pipeline.overlay.vert"></a>

#### overlay.vert : <code>string</code>

**Kind**: static property of [<code>overlay</code>](#module_pipeline.overlay)
<a name="module_pipeline.helper"></a>

### pipeline.helper : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)

- [.helper](#module_pipeline.helper) : <code>object</code>
  - [.frag](#module_pipeline.helper.frag) : <code>string</code>
  - [.vert](#module_pipeline.helper.vert) : <code>string</code>

<a name="module_pipeline.helper.frag"></a>

#### helper.frag : <code>string</code>

**Kind**: static property of [<code>helper</code>](#module_pipeline.helper)
<a name="module_pipeline.helper.vert"></a>

#### helper.vert : <code>string</code>

**Kind**: static property of [<code>helper</code>](#module_pipeline.helper)
<a name="module_pipeline.error"></a>

### pipeline.error : <code>object</code>

**Kind**: static constant of [<code>pipeline</code>](#module_pipeline)

- [.error](#module_pipeline.error) : <code>object</code>
  - [.frag](#module_pipeline.error.frag) : <code>string</code>
  - [.vert](#module_pipeline.error.vert) : <code>string</code>

<a name="module_pipeline.error.frag"></a>

#### error.frag : <code>string</code>

**Kind**: static property of [<code>error</code>](#module_pipeline.error)
<a name="module_pipeline.error.vert"></a>

#### error.vert : <code>string</code>

**Kind**: static property of [<code>error</code>](#module_pipeline.error)
<a name="module_postProcessing"></a>

## postProcessing

- [postProcessing](#module_postProcessing)
  - [.bilateralBlur](#module_postProcessing.bilateralBlur) : <code>object</code>
    - [.frag](#module_postProcessing.bilateralBlur.frag) : <code>string</code>
  - [.dof](#module_postProcessing.dof) : <code>object</code>
    - [.frag](#module_postProcessing.dof.frag) : <code>string</code>
  - [.downsample](#module_postProcessing.downsample) : <code>object</code>
    - [.frag](#module_postProcessing.downsample.frag) : <code>string</code>
  - [.postProcessing](#module_postProcessing.postProcessing) : <code>object</code>
    - [.frag](#module_postProcessing.postProcessing.frag) : <code>string</code>
    - [.vert](#module_postProcessing.postProcessing.vert) : <code>string</code>
  - [.sao](#module_postProcessing.sao) : <code>object</code>
    - [.frag](#module_postProcessing.sao.frag) : <code>string</code>
  - [.gtao](#module_postProcessing.gtao) : <code>object</code>
    - [.frag](#module_postProcessing.gtao.frag) : <code>string</code>
  - [.threshold](#module_postProcessing.threshold) : <code>object</code>
    - [.frag](#module_postProcessing.threshold.frag) : <code>string</code>
  - [.upsample](#module_postProcessing.upsample) : <code>object</code>
    - [.frag](#module_postProcessing.upsample.frag) : <code>string</code>

<a name="module_postProcessing.bilateralBlur"></a>

### postProcessing.bilateralBlur : <code>object</code>

**Kind**: static constant of [<code>postProcessing</code>](#module_postProcessing)
<a name="module_postProcessing.bilateralBlur.frag"></a>

#### bilateralBlur.frag : <code>string</code>

**Kind**: static property of [<code>bilateralBlur</code>](#module_postProcessing.bilateralBlur)
<a name="module_postProcessing.dof"></a>

### postProcessing.dof : <code>object</code>

**Kind**: static constant of [<code>postProcessing</code>](#module_postProcessing)
<a name="module_postProcessing.dof.frag"></a>

#### dof.frag : <code>string</code>

DoF (Depth of Field)

Based on:

- "Bokeh depth of field in a single pass", Dennis Gustafsson: https://blog.voxagon.se/2018/05/04/bokeh-depth-of-field-in-single-pass.html
- "GLSL depth of field with bokeh v2.4", Martins Upitis: https://devlog-martinsh.blogspot.com/2011/12/glsl-depth-of-field-with-bokeh-v24.html

**Kind**: static property of [<code>dof</code>](#module_postProcessing.dof)
<a name="module_postProcessing.downsample"></a>

### postProcessing.downsample : <code>object</code>

**Kind**: static constant of [<code>postProcessing</code>](#module_postProcessing)
<a name="module_postProcessing.downsample.frag"></a>

#### downsample.frag : <code>string</code>

Downsample

Reference Implementation: https://github.com/keijiro/KinoBloom

**Kind**: static property of [<code>downsample</code>](#module_postProcessing.downsample)
<a name="module_postProcessing.postProcessing"></a>

### postProcessing.postProcessing : <code>object</code>

**Kind**: static constant of [<code>postProcessing</code>](#module_postProcessing)

- [.postProcessing](#module_postProcessing.postProcessing) : <code>object</code>
  - [.frag](#module_postProcessing.postProcessing.frag) : <code>string</code>
  - [.vert](#module_postProcessing.postProcessing.vert) : <code>string</code>

<a name="module_postProcessing.postProcessing.frag"></a>

#### postProcessing.frag : <code>string</code>

**Kind**: static property of [<code>postProcessing</code>](#module_postProcessing.postProcessing)
<a name="module_postProcessing.postProcessing.vert"></a>

#### postProcessing.vert : <code>string</code>

**Kind**: static property of [<code>postProcessing</code>](#module_postProcessing.postProcessing)
<a name="module_postProcessing.sao"></a>

### postProcessing.sao : <code>object</code>

**Kind**: static constant of [<code>postProcessing</code>](#module_postProcessing)
<a name="module_postProcessing.sao.frag"></a>

#### sao.frag : <code>string</code>

SAO (Scalable Ambient Obscurance)

Paper: https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf
(https://casual-effects.com/research/McGuire2012SAO/index.html)

Reference Implementation: https://gist.github.com/transitive-bullshit/6770311

Updates: Marcin Ignac (2017-05-08) and Damien Seguin (2023-10)

**Kind**: static property of [<code>sao</code>](#module_postProcessing.sao)
<a name="module_postProcessing.gtao"></a>

### postProcessing.gtao : <code>object</code>

**Kind**: static constant of [<code>postProcessing</code>](#module_postProcessing)
<a name="module_postProcessing.gtao.frag"></a>

#### gtao.frag : <code>string</code>

GTAO (Ground Truth)

Paper: https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf

Reference Implementation: https://github.com/GameTechDev/XeGTAO/blob/master/Source/Rendering/Shaders/XeGTAO.hlsli

Updates: Damien Seguin (2023-10)

**Kind**: static property of [<code>gtao</code>](#module_postProcessing.gtao)
<a name="module_postProcessing.threshold"></a>

### postProcessing.threshold : <code>object</code>

**Kind**: static constant of [<code>postProcessing</code>](#module_postProcessing)
<a name="module_postProcessing.threshold.frag"></a>

#### threshold.frag : <code>string</code>

**Kind**: static property of [<code>threshold</code>](#module_postProcessing.threshold)
<a name="module_postProcessing.upsample"></a>

### postProcessing.upsample : <code>object</code>

**Kind**: static constant of [<code>postProcessing</code>](#module_postProcessing)
<a name="module_postProcessing.upsample.frag"></a>

#### upsample.frag : <code>string</code>

Upsample

Reference Implementation: https://github.com/keijiro/KinoBloom

**Kind**: static property of [<code>upsample</code>](#module_postProcessing.upsample)
<a name="module_reflectionProbe"></a>

## reflectionProbe

- [reflectionProbe](#module_reflectionProbe)
  - [.blitToOctMapAtlas](#module_reflectionProbe.blitToOctMapAtlas) : <code>object</code>
    - [.frag](#module_reflectionProbe.blitToOctMapAtlas.frag) : <code>string</code>
  - [.convolveOctMapAtlasToOctMap](#module_reflectionProbe.convolveOctMapAtlasToOctMap) : <code>object</code>
    - [.frag](#module_reflectionProbe.convolveOctMapAtlasToOctMap.frag) : <code>string</code>
  - [.cubemapToOctMap](#module_reflectionProbe.cubemapToOctMap) : <code>object</code>
    - [.frag](#module_reflectionProbe.cubemapToOctMap.frag) : <code>string</code>
  - [.downsampleFromOctMapAtlas](#module_reflectionProbe.downsampleFromOctMapAtlas) : <code>object</code>
    - [.frag](#module_reflectionProbe.downsampleFromOctMapAtlas.frag) : <code>string</code>
  - [.prefilterFromOctMapAtlas](#module_reflectionProbe.prefilterFromOctMapAtlas) : <code>object</code>
    - [.frag](#module_reflectionProbe.prefilterFromOctMapAtlas.frag) : <code>string</code>

<a name="module_reflectionProbe.blitToOctMapAtlas"></a>

### reflectionProbe.blitToOctMapAtlas : <code>object</code>

**Kind**: static constant of [<code>reflectionProbe</code>](#module_reflectionProbe)
<a name="module_reflectionProbe.blitToOctMapAtlas.frag"></a>

#### blitToOctMapAtlas.frag : <code>string</code>

**Kind**: static property of [<code>blitToOctMapAtlas</code>](#module_reflectionProbe.blitToOctMapAtlas)
<a name="module_reflectionProbe.convolveOctMapAtlasToOctMap"></a>

### reflectionProbe.convolveOctMapAtlasToOctMap : <code>object</code>

**Kind**: static constant of [<code>reflectionProbe</code>](#module_reflectionProbe)
<a name="module_reflectionProbe.convolveOctMapAtlasToOctMap.frag"></a>

#### convolveOctMapAtlasToOctMap.frag : <code>string</code>

**Kind**: static property of [<code>convolveOctMapAtlasToOctMap</code>](#module_reflectionProbe.convolveOctMapAtlasToOctMap)
<a name="module_reflectionProbe.cubemapToOctMap"></a>

### reflectionProbe.cubemapToOctMap : <code>object</code>

**Kind**: static constant of [<code>reflectionProbe</code>](#module_reflectionProbe)
<a name="module_reflectionProbe.cubemapToOctMap.frag"></a>

#### cubemapToOctMap.frag : <code>string</code>

**Kind**: static property of [<code>cubemapToOctMap</code>](#module_reflectionProbe.cubemapToOctMap)
<a name="module_reflectionProbe.downsampleFromOctMapAtlas"></a>

### reflectionProbe.downsampleFromOctMapAtlas : <code>object</code>

**Kind**: static constant of [<code>reflectionProbe</code>](#module_reflectionProbe)
<a name="module_reflectionProbe.downsampleFromOctMapAtlas.frag"></a>

#### downsampleFromOctMapAtlas.frag : <code>string</code>

**Kind**: static property of [<code>downsampleFromOctMapAtlas</code>](#module_reflectionProbe.downsampleFromOctMapAtlas)
<a name="module_reflectionProbe.prefilterFromOctMapAtlas"></a>

### reflectionProbe.prefilterFromOctMapAtlas : <code>object</code>

**Kind**: static constant of [<code>reflectionProbe</code>](#module_reflectionProbe)
<a name="module_reflectionProbe.prefilterFromOctMapAtlas.frag"></a>

#### prefilterFromOctMapAtlas.frag : <code>string</code>

**Kind**: static property of [<code>prefilterFromOctMapAtlas</code>](#module_reflectionProbe.prefilterFromOctMapAtlas)
<a name="module_skybox"></a>

## skybox

- [skybox](#module_skybox)
  - [.skybox](#module_skybox.skybox) : <code>object</code>
    - [.frag](#module_skybox.skybox.frag) : <code>string</code>
    - [.vert](#module_skybox.skybox.vert) : <code>string</code>
  - [.skyEnvMap](#module_skybox.skyEnvMap) : <code>object</code>
    - [.frag](#module_skybox.skyEnvMap.frag) : <code>string</code>
    - [.vert](#module_skybox.skyEnvMap.vert) : <code>string</code>

<a name="module_skybox.skybox"></a>

### skybox.skybox : <code>object</code>

**Kind**: static constant of [<code>skybox</code>](#module_skybox)

- [.skybox](#module_skybox.skybox) : <code>object</code>
  - [.frag](#module_skybox.skybox.frag) : <code>string</code>
  - [.vert](#module_skybox.skybox.vert) : <code>string</code>

<a name="module_skybox.skybox.frag"></a>

#### skybox.frag : <code>string</code>

**Kind**: static property of [<code>skybox</code>](#module_skybox.skybox)
<a name="module_skybox.skybox.vert"></a>

#### skybox.vert : <code>string</code>

Skybox

Based on http://gamedev.stackexchange.com/questions/60313/implementing-a-skybox-with-glsl-version-330

**Kind**: static property of [<code>skybox</code>](#module_skybox.skybox)
<a name="module_skybox.skyEnvMap"></a>

### skybox.skyEnvMap : <code>object</code>

**Kind**: static constant of [<code>skybox</code>](#module_skybox)

- [.skyEnvMap](#module_skybox.skyEnvMap) : <code>object</code>
  - [.frag](#module_skybox.skyEnvMap.frag) : <code>string</code>
  - [.vert](#module_skybox.skyEnvMap.vert) : <code>string</code>

<a name="module_skybox.skyEnvMap.frag"></a>

#### skyEnvMap.frag : <code>string</code>

Sky

Based on "A Practical Analytic Model for Daylight" aka The Preetham Model, the de facto standard analytic skydome model

Paper: https://www.researchgate.net/publication/220720443_A_Practical_Analytic_Model_for_Daylight

Reference Implementation:

- First implemented by Simon Wallner http://www.simonwallner.at/projects/atmospheric-scattering
- Improved by Martins Upitis http://blenderartists.org/forum/showthread.php?245954-preethams-sky-impementation-HDR
- Three.js integration by zz85 http://twitter.com/blurspline

Updates: Marcin Ignac http://twitter.com/marcinignac (2015-09) and Damien Seguin (2023-10)

**Kind**: static property of [<code>skyEnvMap</code>](#module_skybox.skyEnvMap)
<a name="module_skybox.skyEnvMap.vert"></a>

#### skyEnvMap.vert : <code>string</code>

**Kind**: static property of [<code>skyEnvMap</code>](#module_skybox.skyEnvMap)

<!-- api-end -->

## License

MIT. See [license file](https://github.com/pex-gl/pex-shaders/blob/main/LICENSE.md).
