// Percentage-Closer Soft Shadows (PCSS)
// Papers:
// - https://developer.download.nvidia.com/shaderlibrary/docs/shadow_PCSS.pdf
// - https://wojtsterna.files.wordpress.com/2023/02/contact_hardening_soft_shadows.pdf
// - https://www.gamedevs.org/uploads/advanced-soft-shadow-mapping-techniques.pdf
// Reference Implementations:
// - https://developer.download.nvidia.com/whitepapers/2008/PCSS_Integration.pdf
// - https://developer.download.nvidia.com/SDK/10.5/Samples/PercentageCloserSoftShadows.zip

// using vogelDisk: https://drdesten.github.io/web/tools/vogel_disk/?sample_input=64
// instead of:
// const vec2 poissonDisk[64] = vec2[](
//   vec2(-0.934812, 0.366741), vec2(-0.918943, -0.0941496), vec2(-0.873226, 0.62389), vec2(-0.8352, 0.937803), vec2(-0.822138, -0.281655), vec2(-0.812983, 0.10416), vec2(-0.786126, -0.767632), vec2(-0.739494, -0.535813), vec2(-0.681692, 0.284707), vec2(-0.61742, -0.234535), vec2(-0.601184, 0.562426), vec2(-0.607105, 0.847591), vec2(-0.581835, -0.00485244), vec2(-0.554247, -0.771111), vec2(-0.483383, -0.976928), vec2(-0.476669, -0.395672), vec2(-0.439802, 0.362407), vec2(-0.409772, -0.175695), vec2(-0.367534, 0.102451), vec2(-0.35313, 0.58153), vec2(-0.341594, -0.737541), vec2(-0.275979, 0.981567), vec2(-0.230811, 0.305094), vec2(-0.221656, 0.751152), vec2(-0.214393, -0.0592364), vec2(-0.204932, -0.483566), vec2(-0.183569, -0.266274), vec2(-0.123936, -0.754448), vec2(-0.0859096, 0.118625), vec2(-0.0610675, 0.460555), vec2(-0.0234687, -0.962523), vec2(-0.00485244, -0.373394), vec2(0.0213324, 0.760247), vec2(0.0359813, -0.0834071), vec2(0.0877407, -0.730766), vec2(0.14597, 0.281045), vec2(0.18186, -0.529649), vec2(0.188208, -0.289529), vec2(0.212928, 0.063509), vec2(0.23661, 0.566027), vec2(0.266579, 0.867061), vec2(0.320597, -0.883358), vec2(0.353557, 0.322733), vec2(0.404157, -0.651479), vec2(0.410443, -0.413068), vec2(0.413556, 0.123325), vec2(0.46556, -0.176183), vec2(0.49266, 0.55388), vec2(0.506333, 0.876888), vec2(0.535875, -0.885556), vec2(0.615894, 0.0703452), vec2(0.637135, -0.637623), vec2(0.677236, -0.174291), vec2(0.67626, 0.7116), vec2(0.686331, -0.389935), vec2(0.691031, 0.330729), vec2(0.715629, 0.999939), vec2(0.8493, -0.0485549), vec2(0.863582, -0.85229), vec2(0.890622, 0.850581), vec2(0.898068, 0.633778), vec2(0.92053, -0.355693), vec2(0.933348, -0.62981), vec2(0.95294, 0.156896)
// );

const PCSSCommon = /* glsl */ `
#ifndef PCSS_BLOCKER_SEARCH_NUM_SAMPLES
  #define PCSS_BLOCKER_SEARCH_NUM_SAMPLES 25
#endif
#ifndef PCSS_PCF_NUM_SAMPLES
  #define PCSS_PCF_NUM_SAMPLES 64
#endif

float interleavedGradientNoise(vec2 fragCoord) {
  const vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(fragCoord, magic.xy)));
}

mat2 getRandomRotationMatrix(highp vec2 fragCoord) {
  // float r = rand(fragCoord) * TWO_PI;
  float randomAngle = interleavedGradientNoise(fragCoord) * TWO_PI;
  vec2 randomBase = vec2(cos(randomAngle), sin(randomAngle));
  return mat2(randomBase.x, randomBase.y, -randomBase.y, randomBase.x);
}

#if (__VERSION__ < 300)
  const float GOLDEN_ANGLE = PI * (3.0 - sqrt(5.0));
  vec2 vogelDiskSample(float n, float count) {
    float theta = n * GOLDEN_ANGLE;
    float radius = (1.0 / sqrt(count)) * sqrt(n);
    return vec2(radius * cos(theta), radius * sin(theta));
  }
#else
  const vec2 vogelDisk[64] = vec2[](vec2(0.07966914016126773, -0.0005732549414365655),vec2(-0.12160530145582471, 0.10283965425501301),vec2(0.008559818525228833, -0.197458844206032),vec2(0.13356640242431705, 0.18501312713480866),vec2(-0.269830801109193, -0.04676021929400281),vec2(0.23862848827685754, -0.15791561224005177),vec2(-0.09145217101863704, 0.3071892456093635),vec2(-0.16649994145461533, -0.30437045701653237),vec2(0.33360187330480306, 0.12444185472734362),vec2(-0.3648472506019276, 0.14643122426640393),vec2(0.16295804188571, -0.36743756507231173),vec2(0.11814591296857804, 0.40389274018272564),vec2(-0.39109215347150406, -0.22216619295880746),vec2(0.43984778429926974, -0.0991894497563406),vec2(-0.2824726599141313, 0.38881286099524415),vec2(-0.07196259394779835, -0.48861810336110434),vec2(0.3795331553348995, 0.3266462474773111),vec2(-0.5311851850227693, 0.021032353535204915),vec2(0.3723796163057802, -0.3798174856209827),vec2(-0.03421619527550065, 0.5508226133906681),vec2(-0.37133596181036055, -0.43510931729303065),vec2(0.5657057697780938, 0.07671481330934922),vec2(-0.49542832895271105, 0.3380662747684381),vec2(0.12427771910967947, -0.5917579278786026),vec2(0.2988957646566429, 0.536255888187953),vec2(-0.6100770454895419, -0.19242280712483223),vec2(0.5754234023037136, -0.27046195686657265),vec2(-0.2617843818309086, 0.6041130418557645),vec2(-0.2345742995202231, -0.6285079469299325),vec2(0.59225695199046, 0.315282971433257),vec2(-0.6762525075113398, 0.17538638065344198),vec2(0.37071132728294354, -0.5906749150680255),vec2(0.1119798859418661, 0.7017402283731283),vec2(-0.5807270152810202, -0.4435682524557845),vec2(0.7229827225912143, -0.06119326417718071),vec2(-0.5144794788954391, 0.5461387788248903),vec2(-0.005035179534685496, -0.7557546423829214),vec2(0.5055857377426614, 0.5663728829872585),vec2(-0.7810140733390272, -0.07214936952359105),vec2(0.6170681003447506, -0.47552351060683423),vec2(-0.15109977600025168, 0.7820762666899624),vec2(-0.43760314844428994, -0.6821127366950525),vec2(0.7772009255491943, 0.21481487028437787),vec2(-0.742204728724318, 0.3758394044302885),vec2(0.28114246867378123, -0.7824253564882913),vec2(0.3091922614465049, 0.7803683548608),vec2(-0.7789831306606205, -0.36561570268862775),vec2(0.8145440939773348, -0.2543941296975529),vec2(-0.4488757377357506, 0.7504758305912105),vec2(-0.1933624476019976, -0.8604246222601459),vec2(0.7154581485450054, 0.513848417434855),vec2(-0.8988765686147268, 0.11036534262592021),vec2(0.5783350546530844, -0.6902686901177914),vec2(0.024600692161986272, 0.9131155784626814),vec2(-0.6564461645240189, -0.657849672537283),vec2(0.9212949234450745, 0.04697899281368057),vec2(-0.7330423210662792, 0.5978985715758123),vec2(0.12225611512756368, -0.9393399804201348),vec2(0.5334856827883492, 0.7868760176859763),vec2(-0.948368229388031, -0.21678429915641398),vec2(0.8372175428305082, -0.4798472000523386),vec2(-0.31121110469716806, 0.9318623471900049),vec2(-0.41881630178513873, -0.899674402337137),vec2(0.9082566602526256, 0.38845471061254216));
#endif
`;

const PCSS = /* glsl */ `
// Using similar triangles from the surface point to the area light
vec2 SearchRegionRadiusUV(float zWorld, float near, vec2 radiusUV) {
  return radiusUV * (zWorld - near) / zWorld;
}

// Shadow Mapping: GPU-based Tips and Techniques
// https://gdcvault.com/play/1013442/Shadow-Mapping-Tricks-and (p41)
// Derivatives of light-space depth with respect to texture coordinates
vec2 DepthGradient(vec3 position) {
  vec3 duvdist_dx = dFdx(position);
  vec3 duvdist_dy = dFdy(position);

  return vec2(
    duvdist_dy.y * duvdist_dx.z - duvdist_dx.y * duvdist_dy.z,
    duvdist_dx.x * duvdist_dy.z - duvdist_dy.x * duvdist_dx.z
  ) / ((duvdist_dx.x * duvdist_dy.y) - (duvdist_dx.y * duvdist_dy.x));
}

float BiasedZ(float z0, vec2 dz_duv, vec2 offset) {
  return z0 + dot(dz_duv, offset);
}

void PCSSFindBlocker(
  sampler2D depths,
  vec2 uv,
  float compare,
  float near,
  float far,
  vec2 searchWidth,
  vec2 dz_duv,
  mat2 R,
  out float blockerSum,
  out float numBlockers
) {
  for (int i = 0; i < PCSS_BLOCKER_SEARCH_NUM_SAMPLES; i++) {
    #if (__VERSION__ < 300)
      vec2 r = vogelDiskSample(float(i), float(PCSS_BLOCKER_SEARCH_NUM_SAMPLES));
    #else
      vec2 r = vogelDisk[i];
    #endif
    highp vec2 offset = R * (r * searchWidth);

    float depth = texture2D(depths, uv + offset).r;
    float z = BiasedZ(compare, dz_duv, offset);

    if (depth < z) {
      blockerSum += depth;
      numBlockers += 1.0;
    }
  }
}

float PCSSPCFFilter(sampler2D depths, vec2 size, vec2 uv, float compare, float near, float far, vec2 dz_duv, mat2 R, vec2 filterRadiusUV) {
  float result = 0.0;

  for (int i = 0; i < PCSS_PCF_NUM_SAMPLES; ++i) {
    #if (__VERSION__ < 300)
      vec2 r = vogelDiskSample(float(i), float(PCSS_PCF_NUM_SAMPLES));
    #else
      vec2 r = vogelDisk[i];
    #endif
    highp vec2 offset = R * (r * filterRadiusUV);

    float z = BiasedZ(compare, dz_duv, offset);

    result += texture2DCompare(depths, uv + offset, z, near, far);
  }
  return result / float(PCSS_PCF_NUM_SAMPLES);
}

float PCSS(sampler2D depths, vec2 size, vec2 uv, float compare, float near, float far, float ndcLightZ, vec2 radiusUV) {
  vec2 shadowMapSizeInverse = 1.0 / size;
  mat2 R = getRandomRotationMatrix(gl_FragCoord.xy);
  vec2 dz_duv = DepthGradient(vec3(uv.xy, ndcLightZ));

  // STEP 1: blocker search
  float avgBlockerDepth = 0.0;
  float numBlockers = 0.0;
  vec2 searchRegionRadiusUV = SearchRegionRadiusUV(compare, near, radiusUV) * shadowMapSizeInverse;
  PCSSFindBlocker(
    depths,
    uv,
    compare,
    near,
    far,
    searchRegionRadiusUV,
    dz_duv,
    R,
    avgBlockerDepth,
    numBlockers
  );

  // There are no occluders so early out (this saves filtering and avoid division by 0)
  if (numBlockers == 0.0) return 1.0;

  // Actually perform the average
  avgBlockerDepth /= numBlockers;

  // STEP 2: penumbra size
  // Offset preventing aliasing on contact.
  vec2 AAOffset = shadowMapSizeInverse * 10.0;
  // TODO: should it be adjusted for spotlights?
  vec2 penumbraRatio = ((compare - avgBlockerDepth) + AAOffset);
  vec2 filterRadiusUV = penumbraRatio * radiusUV * shadowMapSizeInverse;

  // STEP 3: filtering
  return PCSSPCFFilter(depths, size, uv, compare, near, far, dz_duv, R, filterRadiusUV);
}
`;

const PCSSCube = /* glsl */ `
void PCSSFindBlockerCube(
  samplerCube depths,
  vec3 direction,
  float compare,
  float searchWidth,
  mat2 R,
  out float blockerSum,
  out float numBlockers
) {
  for (int i = 0; i < PCSS_BLOCKER_SEARCH_NUM_SAMPLES; i++) {
    #if (__VERSION__ < 300)
      vec2 r = vogelDiskSample(float(i), float(PCSS_BLOCKER_SEARCH_NUM_SAMPLES));
    #else
      vec2 r = R * vogelDisk[i];
    #endif
    highp vec3 offset = vec3(r.x, float(i / PCSS_BLOCKER_SEARCH_NUM_SAMPLES), r.y) * searchWidth;

    float depth = textureCube(depths, normalize(direction + offset)).r;
    // float depth = unpackDepth(textureCube(depths, normalize(direction + offset))) * DEPTH_PACK_FAR;

    if (depth < compare) {
      blockerSum += depth;
      numBlockers += 1.0;
    }
  }
}

float PCSSPCFFilterCube(samplerCube depths, vec2 size, vec3 direction, float compare, mat2 R, float filterRadius) {
  float result = 0.0;

  for (int i = 0; i < PCSS_PCF_NUM_SAMPLES; ++i) {
    #if (__VERSION__ < 300)
      vec2 r = vogelDiskSample(float(i), float(PCSS_PCF_NUM_SAMPLES));
    #else
      vec2 r = R * vogelDisk[i];
    #endif
    highp vec3 offset = vec3(r.x, float(i / PCSS_PCF_NUM_SAMPLES), r.y) * filterRadius;

    result += textureCubeCompare(depths, normalize(direction + offset), compare);
    // result += PCFCube(depths, size, normalize(direction + offset), compare);
  }
  return result / float(PCSS_PCF_NUM_SAMPLES);
}

float PCSSCube(samplerCube depths, vec2 size, vec3 direction, float compare, float radius) {
  float shadowMapSizeInverse = (1.0 / size.x);
  mat2 R = getRandomRotationMatrix(gl_FragCoord.xy);

  float avgBlockerDepth = 0.0;
  float numBlockers = 0.0;
  float searchRegionRadius = radius * shadowMapSizeInverse;
  PCSSFindBlockerCube(
    depths,
    direction,
    compare,
    searchRegionRadius,
    R,
    avgBlockerDepth,
    numBlockers
  );

  if (numBlockers == 0.0) return 1.0;

  avgBlockerDepth /= numBlockers;

  float AAOffset = shadowMapSizeInverse * 10.0;
  float penumbraRatio = ((compare - avgBlockerDepth) + AAOffset);
  float filterRadius = penumbraRatio * radius * shadowMapSizeInverse;

  return PCSSPCFFilterCube(depths, size, direction, compare, R, filterRadius);
}
`;

export { PCSSCommon, PCSS, PCSSCube };
