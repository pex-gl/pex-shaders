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
</dl>

<a name="module_pex-shaders"></a>

## pex-shaders

- [pex-shaders](#module_pex-shaders)
  - [.chunks](#module_pex-shaders.chunks) : <code>object</code>
  - [.pipeline](#module_pex-shaders.pipeline) : <code>object</code>
  - [.postProcessing](#module_pex-shaders.postProcessing) : <code>object</code>
  - [.reflectionProbe](#module_pex-shaders.reflectionProbe) : <code>object</code>
  - [.skybox](#module_pex-shaders.skybox) : <code>object</code>
  - [.parser](#module_pex-shaders.parser) : <code>parser</code>

<a name="module_pex-shaders.chunks"></a>

### pex-shaders.chunks : <code>object</code>

Various shader chunks to be inserted in main shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.pipeline"></a>

### pex-shaders.pipeline : <code>object</code>

Main shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.postProcessing"></a>

### pex-shaders.postProcessing : <code>object</code>

Post-processing shaders that operate on fullscreen

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.reflectionProbe"></a>

### pex-shaders.reflectionProbe : <code>object</code>

Reflection probes specific shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.skybox"></a>

### pex-shaders.skybox : <code>object</code>

Skybox specific shaders

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
<a name="module_pex-shaders.parser"></a>

### pex-shaders.parser : <code>parser</code>

Shader string manipulation helpers

**Kind**: static property of [<code>pex-shaders</code>](#module_pex-shaders)
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

<!-- api-end -->

## License

MIT. See [license file](https://github.com/pex-gl/pex-shaders/blob/main/LICENSE.md).
