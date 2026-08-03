// Compiles every shaders/chunks/*.js WGSL fragment together through Dawn's
// real WGSL front-end (via the `webgpu` package) to catch syntax/type errors
// that a purely textual/manual review can miss.
//
// Chunks are pure functions with no bindings of their own (see chunks
// architecture notes) - PBRData and the various `override` feature flags are
// normally supplied by the composing pipeline shader. Since that pipeline
// hasn't been ported to WGSL yet, this test provides a minimal stand-in so
// the chunks can be type-checked as a whole.

import { create, globals } from "webgpu";
import * as chunks from "../shaders/chunks/index.js";

Object.assign(globalThis, globals);

const STUB_PBR_DATA = /* wgsl */ `
struct PBRData {
  baseColor: vec3f,
  opacity: f32,
  emissiveColor: vec3f,
  normalView: vec3f,
  normalWorld: vec3f,
  eyeDirView: vec3f,
  tangentView: vec4f,
  inverseViewMatrix: mat4x4f,
  texCoord0: vec2f,
  texCoord1: vec2f,
  metallic: f32,
  roughness: f32,
  linearRoughness: f32,
  ior: f32,
  f0: vec3f,
  f90: vec3f,
  sheenColor: vec3f,
  sheenRoughness: f32,
  sheenLinearRoughness: f32,
  sheenAlbedoScaling: f32,
  clearCoat: f32,
  clearCoatRoughness: f32,
  clearCoatLinearRoughness: f32,
  clearCoatNormal: vec3f,
  transmission: f32,
  dispersion: f32,
  thickness: f32,
  attenuationColor: vec3f,
  attenuationDistance: f32,
  diffuseTransmission: f32,
  diffuseTransmissionColor: vec3f,
  diffuseTransmissionThickness: f32,
  ao: f32,
  positionWorld: vec3f,
  viewWorld: vec3f,
  reflectionWorld: vec3f,
  NdotV: f32,
  diffuseColor: vec3f,
  indirectDiffuse: vec3f,
  indirectSpecular: vec3f,
  directColor: vec3f,
  transmitted: vec3f,
};
`;

// Feature toggles the chunks expect a pipeline shader to declare as
// \`override\`, plus one helper (readLumaTexture) that belongs to the
// not-yet-ported post-processing luma pass.
const STUB_OVERRIDES = /* wgsl */ `
override USE_TEXCOORD_1: bool = false;
override DEPTH_PASS_ONLY: bool = false;
override DEPTH_PRE_PASS_ONLY: bool = false;
override USE_TANGENTS: bool = false;
override USE_NORMAL_TEXTURE: bool = false;
override USE_CLEAR_COAT_NORMAL_TEXTURE: bool = false;
override USE_DIFFUSE_TRANSMISSION: bool = false;
override USE_VOLUME: bool = false;
override USE_TRANSMISSION: bool = false;
override USE_SHEEN: bool = false;
override USE_CLEAR_COAT: bool = false;
override USE_DISPERSION: bool = false;
override USE_CLEAR_COAT_ROUGHNESS_FROM_MAIN_TEXTURE: bool = false;
override USE_SHEEN_ROUGHNESS_FROM_MAIN_TEXTURE: bool = false;
override USE_SSAO_COLORS: bool = false;
override FILM_GRAIN_QUALITY: i32 = 0;
override DEPTH_PACK_FAR: f32 = 10.0;

fn readLumaTexture(tex: texture_2d<f32>, samp: sampler, uv: vec2f) -> f32 {
  return textureSampleLevel(tex, samp, uv, 0.0).x;
}
`;

function flatten(namespace) {
  const parts = [];
  for (const [name, value] of Object.entries(namespace)) {
    if (typeof value === "string") {
      parts.push(`// ==== ${name} ====\n${value}`);
    } else if (value && typeof value === "object") {
      for (const [subName, subValue] of Object.entries(value)) {
        parts.push(`// ==== ${name}.${subName} ====\n${subValue}`);
      }
    }
  }
  return parts.join("\n\n");
}

const code = [STUB_PBR_DATA, STUB_OVERRIDES, flatten(chunks)].join("\n\n");

const gpu = create([]);
const adapter = await gpu.requestAdapter();
if (!adapter) {
  console.error("No WebGPU adapter available in this environment.");
  process.exit(1);
}
const device = await adapter.requestDevice();

const module = device.createShaderModule({ code });
const info = await module.getCompilationInfo();

const lines = code.split("\n");
for (const message of info.messages) {
  console.log(`[${message.type}] line ${message.lineNum}:${message.linePos} ${message.message}`);
  if (message.lineNum) {
    const start = Math.max(0, message.lineNum - 2);
    const end = Math.min(lines.length, message.lineNum + 1);
    for (let i = start; i < end; i++) console.log(`  ${i + 1}: ${lines[i]}`);
  }
}

const errorCount = info.messages.filter((m) => m.type === "error").length;
const warningCount = info.messages.filter((m) => m.type === "warning").length;
console.log(`\n${errorCount} errors, ${warningCount} warnings`);

process.exit(errorCount > 0 ? 1 : 0);
