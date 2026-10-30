// What a composing pipeline shader normally supplies around the shaders: the
// PBRData and SceneLight structs and the `override` feature flags. Shared by validate-wgsl.js
// (compiles the shaders) and furnace.js (runs them), so the two can never
// disagree about the shape of the data the shaders are written against.

import * as shaders from "../shaders/index.js";

export const STUB_PBR_DATA = /* wgsl */ `
struct PBRData {
  baseColor: vec3f,
  opacity: f32,
  emissive: vec3f,
  normalView: vec3f,
  normalWorld: vec3f,
  bentNormalWorld: vec3f,
  eyeDirView: vec3f,
  eyeDirWorld: vec3f,
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
  clearcoat: f32,
  clearcoatRoughness: f32,
  clearcoatLinearRoughness: f32,
  clearcoatNormal: vec3f,
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
  positionView: vec3f,
  viewWorld: vec3f,
  reflectionWorld: vec3f,
  NdotV: f32,
  diffuseColor: vec3f,
  indirectDiffuse: vec3f,
  indirectSpecular: vec3f,
  directColor: vec3f,
  transmitted: vec3f,
};

// The pipeline shader packs every light type into one shared buffer layout;
// this is the union of the fields the light shaders read.
struct SceneLight {
  position: vec3f,
  direction: vec3f,
  color: vec4f,
  halfExtentX: vec3f,
  halfExtentY: vec3f,
  disk: u32,
  doubleSided: u32,
  innerConeAngle: f32,
  outerConeAngle: f32,
  invSqrFalloff: f32,
  radius: f32,
  depthBiasNormalized: f32,
  projectionMatrix: mat4x4f,
  viewMatrix: mat4x4f,
  castShadows: u32,
  shadowBucket: u32,
  shadowLayer: u32,
  near: f32,
  far: f32,
  radiusUV: vec2f,
  shadowMapSize: vec2f,
};
`;

// Feature toggles the shaders expect a pipeline shader to declare as
// `override`, plus one helper (readLumaTexture) that belongs to the
// not-yet-ported post-processing luma pass.
export const STUB_OVERRIDES = /* wgsl */ `
override USE_TEXCOORD_1: bool = false;
override DEPTH_PASS_ONLY: bool = false;
override DEPTH_PRE_PASS_ONLY: bool = false;
override USE_TANGENTS: bool = false;
override USE_NORMAL_TEXTURE: bool = false;
override USE_CLEARCOAT_NORMAL_TEXTURE: bool = false;
override USE_DIFFUSE_TRANSMISSION: bool = false;
override USE_VOLUME: bool = false;
override USE_TRANSMISSION: bool = false;
override USE_SHEEN: bool = false;
override USE_CLEARCOAT: bool = false;
override USE_DISPERSION: bool = false;
override USE_CLEARCOAT_ROUGHNESS_FROM_MAIN_TEXTURE: bool = false;
override USE_SHEEN_ROUGHNESS_FROM_MAIN_TEXTURE: bool = false;
override USE_SSAO_COLORS: bool = false;
override FILM_GRAIN_QUALITY: i32 = 0;
override DEPTH_PACK_FAR: f32 = 10.0;

fn readLumaTexture(tex: texture_2d<f32>, samp: sampler, uv: vec2f) -> f32 {
  return textureSampleLevel(tex, samp, uv, 0.0).x;
}

// The light shaders sample shadows through a dispatch the pipeline shader
// generates around its size-bucketed map arrays; unlit — and a scene with no
// caster — emits exactly this "always illuminated" form.
fn sampleShadowMap2D(
  bucket: u32,
  layer: u32,
  size: vec2f,
  uv: vec2f,
  compare: f32,
  near: f32,
  far: f32,
  radiusUV: vec2f,
  dzDuv: vec2f,
  ortho: bool,
  fragCoord: vec2f
) -> f32 {
  return 1.0;
}

fn sampleShadowMapCube(
  bucket: u32,
  layer: u32,
  size: vec2f,
  direction: vec3f,
  compare: f32,
  radius: f32,
  far: f32,
  fragCoord: vec2f
) -> f32 {
  return 1.0;
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

/** Every chunk, stubs first, plus whatever entry points the caller appends. */
export function shadersModule(...appended) {
  return [STUB_PBR_DATA, STUB_OVERRIDES, flatten(shaders), ...appended].join(
    "\n\n",
  );
}

/** Dawn device, or exit(1) if this environment has no adapter. */
export async function requestDevice(create) {
  const gpu = create([]);
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    console.error("No WebGPU adapter available in this environment.");
    process.exit(1);
  }
  return await adapter.requestDevice();
}

/** Reports compilation messages with context lines; returns the counts. */
export async function reportCompilation(module, code) {
  const info = await module.getCompilationInfo();
  const lines = code.split("\n");

  for (const message of info.messages) {
    console.log(
      `[${message.type}] line ${message.lineNum}:${message.linePos} ${message.message}`,
    );
    if (message.lineNum) {
      const start = Math.max(0, message.lineNum - 2);
      const end = Math.min(lines.length, message.lineNum + 1);
      for (let i = start; i < end; i++) console.log(`  ${i + 1}: ${lines[i]}`);
    }
  }

  return {
    errorCount: info.messages.filter((m) => m.type === "error").length,
    warningCount: info.messages.filter((m) => m.type === "warning").length,
  };
}
