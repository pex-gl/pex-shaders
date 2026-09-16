// Compiles every shaders/shaders/*.js WGSL fragment together through Dawn's
// real WGSL front-end (via the `webgpu` package) to catch syntax/type errors
// that a purely textual/manual review can miss.
//
// Chunks are pure functions with no bindings of their own (see shaders
// architecture notes) - PBRData and the various `override` feature flags are
// normally supplied by the composing pipeline shader, stubbed in stubs.js.

import { create, globals } from "webgpu";

import { shadersModule, requestDevice, reportCompilation } from "./stubs.js";

Object.assign(globalThis, globals);

const code = shadersModule();

const device = await requestDevice(create);
const module = device.createShaderModule({ code });
const { errorCount, warningCount } = await reportCompilation(module, code);

console.log(`\n${errorCount} errors, ${warningCount} warnings`);

process.exit(errorCount > 0 ? 1 : 0);
