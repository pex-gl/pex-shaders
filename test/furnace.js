// White furnace test on the real indirect shaders, run through Dawn.
//
// A furnace test puts the surface in a constant-1.0 environment: a lossless
// BRDF with unit albedo must return exactly the radiance it received. The
// visual version of this (examples/brdf.js in pex-renderer) cannot check it —
// a white sphere returning 1.0 and one returning 1.55 both clip to white
// against a white background — so energy *gain* is invisible there and only
// shows up numerically, which is what this covers.
//
// The environment is exact rather than approximated: an L0-only SH vector
// makes shIrradiance() return 1.0 for every normal, and a 1x1 cube of 1.0
// makes getPrefilteredReflection() return 1.0 for every direction and lod.

import { create, globals } from "webgpu";

import { shadersModule, requestDevice, reportCompilation } from "./stubs.js";

Object.assign(globalThis, globals);

// Half the width of the capture texture's mip chain, so getTransmissionSample's
// log2(viewportSize.x) * roughness lod stays inside it — textureBicubic reads
// dimensions at lod + 1, which is out of range past the last mip.
const CAPTURE_SIZE = 16;
const VIEWPORT_SIZE = 8;

// A metal with f0 = 1 has Favg = 1, so FmsEms collapses to Ems and the total
// telescopes to (A + B) + (1 - (A + B)) = 1 whatever EnvBRDFApproxAB returns:
// unity there is an algebraic identity, not a fit, and is asserted as such.
const TOLERANCE = 0.001;
// The dielectric split doesn't telescope, so it inherits the analytic fit's
// error — worst at grazing (1.018 at NdotV 0.05). Still 30x under the double
// counted multiple-scattering term this exists to catch.
const DIELECTRIC_TOLERANCE = 0.02;

const HARNESS = /* wgsl */ `
struct Case {
  f0: vec4f,
  f90: vec4f,
  diffuseColor: vec4f,
  attenuationColor: vec4f,
  // roughness, NdotV, transmission, thickness
  params: vec4f,
  // attenuationDistance, ior, unused, unused
  params2: vec4f,
}

@group(0) @binding(0) var<storage, read> cases: array<Case>;
@group(0) @binding(1) var<storage, read_write> results: array<vec4f>;
@group(0) @binding(2) var envMap: texture_cube<f32>;
@group(0) @binding(3) var envMapSampler: sampler;
@group(0) @binding(4) var captureTexture: texture_2d<f32>;
@group(0) @binding(5) var captureTextureSampler: sampler;

const IDENTITY3 = mat3x3f(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
const IDENTITY4 = mat4x4f(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let c = cases[id.x];

  var data: PBRData;
  data.f0 = c.f0.xyz;
  data.f90 = c.f90.xyz;
  data.diffuseColor = c.diffuseColor.xyz;
  data.attenuationColor = c.attenuationColor.xyz;
  data.roughness = c.params.x;
  data.linearRoughness = c.params.x * c.params.x;
  data.NdotV = c.params.y;
  data.transmission = c.params.z;
  data.thickness = c.params.w;
  data.attenuationDistance = c.params2.x;
  data.ior = c.params2.y;
  data.ao = 1.0;
  // The environment is uniform, so the sample directions are free — only
  // NdotV steers the BRDF. A single axis keeps refract() well defined.
  data.normalWorld = vec3f(0.0, 0.0, 1.0);
  data.viewWorld = vec3f(0.0, 0.0, 1.0);
  data.reflectionWorld = vec3f(0.0, 0.0, 1.0);
  data.positionWorld = vec3f(0.0);
  data.indirectDiffuse = vec3f(0.0);
  data.indirectSpecular = vec3f(0.0);
  data.transmitted = vec3f(0.0);

  // 1 / 0.282095 is the L0 basis inverse: shIrradiance() then returns 1.0 for
  // any normal, i.e. the irradiance of a constant-1.0 environment.
  var sh: array<vec4f, 9>;
  sh[0] = vec4f(1.0 / 0.282095);

  EvaluateLightProbe(&data, data.ao, IDENTITY3, 1.0, envMap, envMapSampler, 1.0, sh);

  if (data.transmission > 0.0) {
    EvaluateTransmission(&data, captureTexture, captureTextureSampler, vec2f(${VIEWPORT_SIZE}.0), IDENTITY4, IDENTITY4, IDENTITY4);
  }

  results[id.x] = vec4f(data.indirectDiffuse + data.indirectSpecular + data.transmitted, 0.0);
}
`;

const FLOATS_PER_CASE = 24;

const iorToF0 = (ior) => ((ior - 1) / (ior + 1)) ** 2;

// Sampled across the sweep rather than exhaustively: the failure modes are
// smooth in both parameters, so corners and midpoints are enough.
const ROUGHNESSES = [0, 0.25, 0.5, 0.75, 1];
const NDOTVS = [1, 0.75, 0.5, 0.25, 0.05];

function makeCase({
  label,
  f0,
  f90 = [1, 1, 1],
  diffuseColor = [0, 0, 0],
  roughness,
  NdotV,
  transmission = 0,
  thickness = 0,
  attenuationColor = [1, 1, 1],
  // 0 means "no attenuation" to applyVolumeAttenuation, same as infinity
  attenuationDistance = 0,
  ior = 1.5,
  expect,
}) {
  return {
    label,
    expect,
    // One row per vec4f of the Case struct above
    // prettier-ignore
    data: [
      ...f0, 0,
      ...f90, 0,
      ...diffuseColor, 0,
      ...attenuationColor, 0,
      roughness, NdotV, transmission, thickness,
      attenuationDistance, ior, 0, 0,
    ],
  };
}

const cases = [];

for (const roughness of ROUGHNESSES) {
  for (const NdotV of NDOTVS) {
    // A metal with f0 = 1 absorbs nothing: the strict case, and the one that
    // read 1.55 while the multiple-scattering term was double counted.
    cases.push(
      makeCase({
        label: `white metal r=${roughness} NdotV=${NdotV}`,
        f0: [1, 1, 1],
        roughness,
        NdotV,
        expect: { equals: 1 },
      }),
    );
    // White dielectric: the specular/diffuse split has to add back up to 1.
    cases.push(
      makeCase({
        label: `white dielectric r=${roughness} NdotV=${NdotV}`,
        f0: [0.04, 0.04, 0.04],
        diffuseColor: [1, 1, 1],
        roughness,
        NdotV,
        expect: { equals: 1, tolerance: DIELECTRIC_TOLERANCE },
      }),
    );
  }
}

// KHR_materials_specular scales both f0 and f90; neither may leak energy.
for (const specular of [0, 0.25, 0.5, 0.75, 1]) {
  cases.push(
    makeCase({
      label: `specular=${specular}`,
      f0: new Array(3).fill(0.04 * specular),
      f90: new Array(3).fill(specular),
      diffuseColor: [1, 1, 1],
      roughness: 0,
      NdotV: 0.75,
      expect: { equals: 1 },
    }),
  );
}

// ior drives the same f0 from the other end: 1.0 (no specular) to 2.0 (0.111).
for (const ior of [1, 1.25, 1.5, 1.75, 2]) {
  cases.push(
    makeCase({
      label: `ior=${ior}`,
      f0: new Array(3).fill(iorToF0(ior)),
      diffuseColor: [1, 1, 1],
      roughness: 0,
      NdotV: 0.75,
      ior,
      expect: { equals: 1 },
    }),
  );
}

// Transmitted light comes from the capture texture, also at 1.0, so the
// reflected/transmitted split has to conserve just like the reflected one.
for (const transmission of [0.25, 0.5, 0.75, 1]) {
  cases.push(
    makeCase({
      label: `transmission=${transmission}`,
      f0: [0.04, 0.04, 0.04],
      diffuseColor: [1, 1, 1],
      roughness: 0,
      NdotV: 0.75,
      transmission,
      expect: { equals: 1 },
    }),
  );
}

// The negative control: absorption is real energy loss, so this one must come
// back below 1 on the absorbing channels and untouched on the channel at 1.0.
// A vanishing row in the example means attenuation isn't being applied at all.
for (const attenuationDistance of [2, 1, 0.5]) {
  cases.push(
    makeCase({
      label: `volume attenuationDistance=${attenuationDistance}`,
      f0: [0.04, 0.04, 0.04],
      diffuseColor: [1, 1, 1],
      roughness: 0,
      NdotV: 0.75,
      transmission: 1,
      thickness: 1,
      attenuationColor: [0.5, 0.8, 1],
      attenuationDistance,
      expect: { absorbs: true },
    }),
  );
}

const device = await requestDevice(create);

device.addEventListener?.("uncapturederror", ({ error }) => {
  console.error(`[uncaptured] ${error.message}`);
  process.exit(1);
});

const code = shadersModule(HARNESS);
const module = device.createShaderModule({ code });
const { errorCount } = await reportCompilation(module, code);
if (errorCount > 0) {
  console.log(`\n${errorCount} errors compiling the furnace harness`);
  process.exit(1);
}

const caseData = new Float32Array(cases.length * FLOATS_PER_CASE);
cases.forEach((c, i) => caseData.set(c.data, i * FLOATS_PER_CASE));

const caseBuffer = device.createBuffer({
  size: caseData.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(caseBuffer, 0, caseData);

const resultSize = cases.length * 4 * Float32Array.BYTES_PER_ELEMENT;
const resultBuffer = device.createBuffer({
  size: resultSize,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
});
const readBuffer = device.createBuffer({
  size: resultSize,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

// rgba8unorm rather than a float format: 255 is exactly 1.0 once normalized,
// and it is filterable everywhere without an optional feature.
function createUniformTexture({ label, size, layers = 1, mipLevelCount = 1 }) {
  const texture = device.createTexture({
    label,
    size: [size, size, layers],
    format: "rgba8unorm",
    mipLevelCount,
    dimension: "2d",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  for (let level = 0; level < mipLevelCount; level++) {
    const levelSize = Math.max(1, size >> level);
    const data = new Uint8Array(levelSize * levelSize * layers * 4).fill(255);
    device.queue.writeTexture(
      { texture, mipLevel: level },
      data,
      { bytesPerRow: levelSize * 4, rowsPerImage: levelSize },
      [levelSize, levelSize, layers],
    );
  }

  return texture;
}

const envMap = createUniformTexture({ label: "furnaceEnv", size: 1, layers: 6 });
const captureTexture = createUniformTexture({
  label: "furnaceCapture",
  size: CAPTURE_SIZE,
  mipLevelCount: 1 + Math.log2(CAPTURE_SIZE),
});
const sampler = device.createSampler({
  magFilter: "linear",
  minFilter: "linear",
  mipmapFilter: "linear",
});

const pipeline = device.createComputePipeline({
  layout: "auto",
  compute: { module, entryPoint: "main" },
});

const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: caseBuffer } },
    { binding: 1, resource: { buffer: resultBuffer } },
    { binding: 2, resource: envMap.createView({ dimension: "cube" }) },
    { binding: 3, resource: sampler },
    { binding: 4, resource: captureTexture.createView() },
    { binding: 5, resource: sampler },
  ],
});

const encoder = device.createCommandEncoder();
const pass = encoder.beginComputePass();
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.dispatchWorkgroups(cases.length);
pass.end();
encoder.copyBufferToBuffer(resultBuffer, 0, readBuffer, 0, resultSize);
device.queue.submit([encoder.finish()]);

await readBuffer.mapAsync(GPUMapMode.READ);
const results = new Float32Array(readBuffer.getMappedRange().slice(0));
readBuffer.unmap();

const failures = [];

cases.forEach((c, i) => {
  const rgb = [results[i * 4], results[i * 4 + 1], results[i * 4 + 2]];
  let failed = false;

  if (c.expect.equals !== undefined) {
    const tolerance = c.expect.tolerance ?? TOLERANCE;
    failed = rgb.some((v) => Math.abs(v - c.expect.equals) > tolerance);
  } else if (c.expect.absorbs) {
    // attenuationColor is [0.5, 0.8, 1]: red and green absorb, blue does not.
    failed = !(rgb[0] < 1 - TOLERANCE && rgb[1] < 1 - TOLERANCE);
  }

  if (failed) failures.push({ ...c, rgb });
});

const fmt = (rgb) => rgb.map((v) => v.toFixed(4).padStart(9)).join(" ");

if (process.argv.includes("--verbose")) {
  cases.forEach((c, i) =>
    console.log(
      `  ${c.label.padEnd(38)} ${fmt([results[i * 4], results[i * 4 + 1], results[i * 4 + 2]])}`,
    ),
  );
}

if (failures.length) {
  console.log("Failed cases (rgb):");
  for (const { label, rgb, expect } of failures) {
    const expected =
      expect.equals !== undefined
        ? `${expect.equals} ±${expect.tolerance ?? TOLERANCE}`
        : "< 1";
    console.log(`  ${label.padEnd(38)} ${fmt(rgb)}  expected ${expected}`);
  }
}

// The worst deviation is the number to watch: it tracks how far the analytic
// DFG fit sits from unity, and a jump in it means the energy split moved.
const worst = cases.reduce(
  (acc, c, i) => {
    if (c.expect.equals === undefined) return acc;
    const rgb = [results[i * 4], results[i * 4 + 1], results[i * 4 + 2]];
    const deviation = Math.max(
      ...rgb.map((v) => Math.abs(v - c.expect.equals)),
    );
    return deviation > acc.deviation ? { deviation, label: c.label } : acc;
  },
  { deviation: 0, label: "none" },
);

console.log(
  `\n${cases.length - failures.length}/${cases.length} cases passed`,
  `(worst deviation ${worst.deviation.toFixed(4)} on "${worst.label}")`,
);

process.exit(failures.length > 0 ? 1 : 0);
