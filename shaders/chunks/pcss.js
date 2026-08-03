// Percentage-Closer Soft Shadows (PCSS)
// Papers:
// - https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf
// - https://wojtsterna.files.wordpress.com/2023/02/contact_hardening_soft_shadows.pdf
// - https://www.gamedevs.org/uploads/advanced-soft-shadow-mapping-techniques.pdf
// Reference Implementations:
// - https://developer.download.nvidia.com/whitepapers/2008/PCSS_Integration.pdf
// - https://developer.download.nvidia.com/SDK/10.5/Samples/PercentageCloserSoftShadows.zip

// Using vogelDisk: https://drdesten.github.io/web/tools/vogel_disk/?sample_input=64
const PCSSCommon = /* wgsl */ `
override PCSS_BLOCKER_SEARCH_NUM_SAMPLES: i32 = 25;
override PCSS_PCF_NUM_SAMPLES: i32 = 64;

fn interleavedGradientNoise(fragCoord: vec2f) -> f32 {
  let magic = vec3f(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(fragCoord, magic.xy)));
}

fn getRandomRotationMatrix(fragCoord: vec2f) -> mat2x2f {
  let randomAngle = interleavedGradientNoise(fragCoord) * TWO_PI;
  let randomBase = vec2f(cos(randomAngle), sin(randomAngle));
  return mat2x2f(randomBase.x, randomBase.y, -randomBase.y, randomBase.x);
}

const vogelDisk = array<vec2f, 64>(
  vec2f(0.07966914016126773, -0.0005732549414365655), vec2f(-0.12160530145582471, 0.10283965425501301),
  vec2f(0.008559818525228833, -0.197458844206032), vec2f(0.13356640242431705, 0.18501312713480866),
  vec2f(-0.269830801109193, -0.04676021929400281), vec2f(0.23862848827685754, -0.15791561224005177),
  vec2f(-0.09145217101863704, 0.3071892456093635), vec2f(-0.16649994145461533, -0.30437045701653237),
  vec2f(0.33360187330480306, 0.12444185472734362), vec2f(-0.3648472506019276, 0.14643122426640393),
  vec2f(0.16295804188571, -0.36743756507231173), vec2f(0.11814591296857804, 0.40389274018272564),
  vec2f(-0.39109215347150406, -0.22216619295880746), vec2f(0.43984778429926974, -0.0991894497563406),
  vec2f(-0.2824726599141313, 0.38881286099524415), vec2f(-0.07196259394779835, -0.48861810336110434),
  vec2f(0.3795331553348995, 0.3266462474773111), vec2f(-0.5311851850227693, 0.021032353535204915),
  vec2f(0.3723796163057802, -0.3798174856209827), vec2f(-0.03421619527550065, 0.5508226133906681),
  vec2f(-0.37133596181036055, -0.43510931729303065), vec2f(0.5657057697780938, 0.07671481330934922),
  vec2f(-0.49542832895271105, 0.3380662747684381), vec2f(0.12427771910967947, -0.5917579278786026),
  vec2f(0.2988957646566429, 0.536255888187953), vec2f(-0.6100770454895419, -0.19242280712483223),
  vec2f(0.5754234023037136, -0.27046195686657265), vec2f(-0.2617843818309086, 0.6041130418557645),
  vec2f(-0.2345742995202231, -0.6285079469299325), vec2f(0.59225695199046, 0.315282971433257),
  vec2f(-0.6762525075113398, 0.17538638065344198), vec2f(0.37071132728294354, -0.5906749150680255),
  vec2f(0.1119798859418661, 0.7017402283731283), vec2f(-0.5807270152810202, -0.4435682524557845),
  vec2f(0.7229827225912143, -0.06119326417718071), vec2f(-0.5144794788954391, 0.5461387788248903),
  vec2f(-0.005035179534685496, -0.7557546423829214), vec2f(0.5055857377426614, 0.5663728829872585),
  vec2f(-0.7810140733390272, -0.07214936952359105), vec2f(0.6170681003447506, -0.47552351060683423),
  vec2f(-0.15109977600025168, 0.7820762666899624), vec2f(-0.43760314844428994, -0.6821127366950525),
  vec2f(0.7772009255491943, 0.21481487028437787), vec2f(-0.742204728724318, 0.3758394044302885),
  vec2f(0.28114246867378123, -0.7824253564882913), vec2f(0.3091922614465049, 0.7803683548608),
  vec2f(-0.7789831306606205, -0.36561570268862775), vec2f(0.8145440939773348, -0.2543941296975529),
  vec2f(-0.4488757377357506, 0.7504758305912105), vec2f(-0.1933624476019976, -0.8604246222601459),
  vec2f(0.7154581485450054, 0.513848417434855), vec2f(-0.8988765686147268, 0.11036534262592021),
  vec2f(0.5783350546530844, -0.6902686901177914), vec2f(0.024600692161986272, 0.9131155784626814),
  vec2f(-0.6564461645240189, -0.657849672537283), vec2f(0.9212949234450745, 0.04697899281368057),
  vec2f(-0.7330423210662792, 0.5978985715758123), vec2f(0.12225611512756368, -0.9393399804201348),
  vec2f(0.5334856827883492, 0.7868760176859763), vec2f(-0.948368229388031, -0.21678429915641398),
  vec2f(0.8372175428305082, -0.4798472000523386), vec2f(-0.31121110469716806, 0.9318623471900049),
  vec2f(-0.41881630178513873, -0.899674402337137), vec2f(0.9082566602526256, 0.38845471061254216)
);
`;

const PCSS = /* wgsl */ `
// Using similar triangles from the surface point to the area light
fn SearchRegionRadiusUV(zWorld: f32, near: f32, radiusUV: vec2f) -> vec2f {
  return radiusUV * (zWorld - near) / zWorld;
}

// Shadow Mapping: GPU-based Tips and Techniques
// https://gdcvault.com/play/1013442/Shadow-Mapping-Tricks-and (p41)
// Derivatives of light-space depth with respect to texture coordinates
fn DepthGradient(position: vec3f) -> vec2f {
  let duvdist_dx = dpdx(position);
  let duvdist_dy = dpdy(position);

  return vec2f(
    duvdist_dy.y * duvdist_dx.z - duvdist_dx.y * duvdist_dy.z,
    duvdist_dx.x * duvdist_dy.z - duvdist_dy.x * duvdist_dx.z
  ) / ((duvdist_dx.x * duvdist_dy.y) - (duvdist_dx.y * duvdist_dy.x));
}

fn BiasedZ(z0: f32, dz_duv: vec2f, offset: vec2f) -> f32 {
  return z0 + dot(dz_duv, offset);
}

fn PCSSFindBlocker(
  depths: texture_2d<f32>,
  depthSampler: sampler,
  uv: vec2f,
  compare: f32,
  near: f32,
  far: f32,
  searchWidth: vec2f,
  dz_duv: vec2f,
  R: mat2x2f,
  blockerSum: ptr<function, f32>,
  numBlockers: ptr<function, f32>
) {
  for (var i = 0; i < PCSS_BLOCKER_SEARCH_NUM_SAMPLES; i++) {
    let r = vogelDisk[i];
    let offset = R * (r * searchWidth);

    let depth = textureSampleLevel(depths, depthSampler, uv + offset, 0.0).x;
    let z = BiasedZ(compare, dz_duv, offset);

    if (depth < z) {
      *blockerSum += depth;
      *numBlockers += 1.0;
    }
  }
}

fn PCSSPCFFilter(
  depths: texture_2d<f32>,
  depthSampler: sampler,
  size: vec2f,
  uv: vec2f,
  compare: f32,
  near: f32,
  far: f32,
  dz_duv: vec2f,
  R: mat2x2f,
  filterRadiusUV: vec2f,
  ortho: bool
) -> f32 {
  var result = 0.0;

  for (var i = 0; i < PCSS_PCF_NUM_SAMPLES; i++) {
    let r = vogelDisk[i];
    let offset = R * (r * filterRadiusUV);

    let z = BiasedZ(compare, dz_duv, offset);

    result += texture2DCompare(depths, depthSampler, uv + offset, z, near, far, ortho);
  }
  return result / f32(PCSS_PCF_NUM_SAMPLES);
}

fn PCSS(
  depths: texture_2d<f32>,
  depthSampler: sampler,
  size: vec2f,
  uv: vec2f,
  compare: f32,
  near: f32,
  far: f32,
  ndcLightZ: f32,
  radiusUV: vec2f,
  ortho: bool,
  fragCoord: vec2f
) -> f32 {
  let shadowMapSizeInverse = 1.0 / size;
  let R = getRandomRotationMatrix(fragCoord);
  let dz_duv = DepthGradient(vec3f(uv.xy, ndcLightZ));

  // STEP 1: blocker search
  var avgBlockerDepth = 0.0;
  var numBlockers = 0.0;
  let searchRegionRadiusUV = SearchRegionRadiusUV(compare, near, radiusUV) * shadowMapSizeInverse;
  PCSSFindBlocker(
    depths,
    depthSampler,
    uv,
    compare,
    near,
    far,
    searchRegionRadiusUV,
    dz_duv,
    R,
    &avgBlockerDepth,
    &numBlockers
  );

  // There are no occluders so early out (this saves filtering and avoid division by 0)
  if (numBlockers == 0.0) {
    return 1.0;
  }

  // Actually perform the average
  avgBlockerDepth /= numBlockers;

  // STEP 2: penumbra size
  // Offset preventing aliasing on contact.
  let AAOffset = shadowMapSizeInverse * 10.0;
  // TODO: should it be adjusted for spotlights?
  let penumbraRatio = (compare - avgBlockerDepth) + AAOffset;
  let filterRadiusUV = penumbraRatio * radiusUV * shadowMapSizeInverse;

  // STEP 3: filtering
  return PCSSPCFFilter(depths, depthSampler, size, uv, compare, near, far, dz_duv, R, filterRadiusUV, ortho);
}
`;

const PCSSCube = /* wgsl */ `
fn PCSSFindBlockerCube(
  depths: texture_cube<f32>,
  depthSampler: sampler,
  direction: vec3f,
  compare: f32,
  searchWidth: f32,
  R: mat2x2f,
  blockerSum: ptr<function, f32>,
  numBlockers: ptr<function, f32>
) {
  for (var i = 0; i < PCSS_BLOCKER_SEARCH_NUM_SAMPLES; i++) {
    let r = R * vogelDisk[i];
    let offset = vec3f(r.x, f32(i / PCSS_BLOCKER_SEARCH_NUM_SAMPLES), r.y) * searchWidth;

    let depth = unpackDepth(textureSampleLevel(depths, depthSampler, normalize(direction + offset), 0.0)) * DEPTH_PACK_FAR;

    if (depth < compare) {
      *blockerSum += depth;
      *numBlockers += 1.0;
    }
  }
}

fn PCSSPCFFilterCube(
  depths: texture_cube<f32>,
  depthSampler: sampler,
  size: vec2f,
  direction: vec3f,
  compare: f32,
  R: mat2x2f,
  filterRadius: f32
) -> f32 {
  var result = 0.0;

  for (var i = 0; i < PCSS_PCF_NUM_SAMPLES; i++) {
    let r = R * vogelDisk[i];
    let offset = vec3f(r.x, f32(i / PCSS_PCF_NUM_SAMPLES), r.y) * filterRadius;

    result += textureCubeCompare(depths, depthSampler, normalize(direction + offset), compare);
  }
  return result / f32(PCSS_PCF_NUM_SAMPLES);
}

fn PCSSCube(
  depths: texture_cube<f32>,
  depthSampler: sampler,
  size: vec2f,
  direction: vec3f,
  compare: f32,
  radius: f32,
  fragCoord: vec2f
) -> f32 {
  let shadowMapSizeInverse = 1.0 / size.x;
  let R = getRandomRotationMatrix(fragCoord);

  var avgBlockerDepth = 0.0;
  var numBlockers = 0.0;
  let searchRegionRadius = radius * shadowMapSizeInverse;
  PCSSFindBlockerCube(
    depths,
    depthSampler,
    direction,
    compare,
    searchRegionRadius,
    R,
    &avgBlockerDepth,
    &numBlockers
  );

  if (numBlockers == 0.0) {
    return 1.0;
  }

  avgBlockerDepth /= numBlockers;

  let AAOffset = shadowMapSizeInverse * 10.0;
  let penumbraRatio = (compare - avgBlockerDepth) + AAOffset;
  let filterRadius = penumbraRatio * radius * shadowMapSizeInverse;

  return PCSSPCFFilterCube(depths, depthSampler, size, direction, compare, R, filterRadius);
}
`;

export { PCSSCommon, PCSS, PCSSCube };
