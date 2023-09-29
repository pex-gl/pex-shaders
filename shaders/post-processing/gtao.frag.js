import SHADERS from "../chunks/index.js";

export default /* glsl */ `
precision highp float;

${SHADERS.output.frag}

uniform sampler2D uTexture;
uniform sampler2D uDepthTexture;
uniform sampler2D uNormalTexture;
uniform vec2 uViewportSize;

uniform sampler2D uNoiseTexture;
uniform float uNear;
uniform float uFar;
uniform float uFov;

uniform float uIntensity; // Darkending factor
uniform float uRadius; // World-space AO radius in scene units (r).  e.g., 1.0m
// uniform float uBias; // Bias to avoid AO in smooth corners, e.g., 0.01m
uniform float uBrightness;
uniform float uContrast;
// uniform vec2 uNoiseScale;
vec2 uNoiseScale = vec2(10.0);

#ifdef USE_COLOR_BOUNCE
uniform float uColorBounceIntensity;
#endif

// Includes
${SHADERS.math.random}
${SHADERS.math.TWO_PI}
${SHADERS.depthRead}
${SHADERS.depthPosition}
${SHADERS.colorCorrection}


// GTAO (Ground Truth)
// https://github.com/gkjohnson/threejs-sandbox/blob/8ebf61b0a36d188ccf50f31d31dacc44319e3986/gtaoPass/src/GTAOShader.js#L16

// #define USE_COLOR_BOUNCE
// Total number of direct samples to take at each pixel
// #define NUM_SAMPLES 11
// const float NUM_SAMPLES_FLOAT = float(NUM_SAMPLES);
// const float INV_NUM_SAMPLES_FLOAT = 1.0 / NUM_SAMPLES_FLOAT;

${SHADERS.math.saturate}
${SHADERS.math.PI}

vec3 getPositionVS(vec2 uv) {
  return reconstructPositionFromDepth(uv, readDepth(uDepthTexture, uv, uNear, uFar));
}

#define HALF_PI			1.5707963267948966
#define ONE_OVER_PI		0.3183098861837906

#define NUM_DIRECTIONS 16
#define NUM_STEPS 16
// #define RADIUS 5.0 // in world space

#define ENABLE_FALLOFF 1
#define FALLOFF_START2 0.16
#define FALLOFF_END2 4.0

// NONE: 0,
// RANDOM: 1,
// BLUE_NOISE: 2,
#define ENABLE_ROTATION_JITTER 2
#define ENABLE_RADIUS_JITTER 2

// uniform vec4 params;
vec4 params = vec4(0.0);

// float round( float f ) {
//   return f < 0.5 ? floor( f ) : ceil( f );
// }
// vec2 round( vec2 v ) {
//   v.x = round( v.x );
//   v.y = round( v.y );
//   return v;
// }

float Falloff( float dist2 ) {
  return 2.0 * clamp(
    ( dist2 - FALLOFF_START2 ) / ( FALLOFF_END2 - FALLOFF_START2 ),
    0.0,
    1.0
  );
}

void main() {
  float occlusion = 0.0;

  #ifdef USE_COLOR_BOUNCE
    vec3 color = vec3(0.0);
  #endif

  vec2 vUV = gl_FragCoord.xy / uViewportSize;
  vec3 originVS = getPositionVS(vUV);

  float depth = clamp(smoothstep(uNear, uFar, -originVS.z), 0.0, 1.0);

  if (depth >= 1.0) {
  // if (normalColor.a == 0.0) {
    // gl_FragColor = currColor;
    // gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    // gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
    // return;
    occlusion = 1.0;
  } else {
    vec4 normalColor = texture2D(uNormalTexture, vUV);

    vec3 normalVS = normalColor.rgb * 2.0 - 1.0;
    vec2 screenCoord = gl_FragCoord.xy;
    vec3 vpos = originVS; //GetViewPosition( renderSize * vUv );

    // vpos.z *= -1.0;
    // if it's the background
    // if ( vpos.w == 1.0 ) {
    //   gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0);
    //   return;
    // }

    vec3 s;
    vec3 vnorm	= normalVS;//UnpackNormal( texture2D( normalBuffer, vUv ) );
    vec3 vdir	= normalize( - vpos.xyz );
    vec3 dir, ws;

    // calculation uses left handed system
    // vnorm.z = - vnorm.z;

    vec2 noises	= vec2( 0.0 );
    vec2 offset;
    vec2 horizons = vec2( - 1.0, - 1.0 );

    // scale the search radius by the depth and camera FOV
    //float radius = ( RADIUS * clipInfo.z ) / vpos.z;
    float RADIUS = uRadius / 10.0;
    float radius = ( RADIUS * uFar ) / vpos.z;
    radius = max( float( NUM_STEPS ), radius );
    // radius = float(NUM_STEPS) * 20.0;

    // float stepSize	= radius / float( NUM_STEPS );
    float stepSize	= radius / float( NUM_STEPS ) * 6.0; //TEMP
    float phi		= 0.0;
    float division	= noises.y * stepSize;
    float currStep	= 1.0 + division + 0.25 * stepSize * params.y;
    float dist2, invdist, falloff, cosh;


    #if ENABLE_ROTATION_JITTER == 1
      // Rotation jitter approach from
      // https://github.com/MaxwellGengYF/Unity-Ground-Truth-Ambient-Occlusion/blob/9cc30e0f31eb950a994c71866d79b2798d1c508e/Shaders/GTAO_Common.cginc#L152-L155
      float rotJitterOffset = PI * fract( 52.9829189 * fract( dot( screenCoord, vec2( 0.06711056, 0.00583715 ) ) ) );
    #elif ENABLE_ROTATION_JITTER == 2
      // float rotJitterOffset = PI * texture2D( blueNoiseTex, gl_FragCoord.xy / blueNoiseSize ).r;
      float rotJitterOffset = PI * texture2D(uNoiseTexture, gl_FragCoord.xy * uNoiseScale).x;
    #endif

    #if ENABLE_RADIUS_JITTER == 1
      float jitterMod = ( gl_FragCoord.x + gl_FragCoord.y ) * 0.25;
      float radiusJitterOffset = mod( jitterMod, 1.0 ) * stepSize * 0.25;
    #elif ENABLE_RADIUS_JITTER == 2
      // float radiusJitterOffset = PI * texture2D( blueNoiseTex, gl_FragCoord.xy / blueNoiseSize ).g;
      float radiusJitterOffset = PI * texture2D(uNoiseTexture, gl_FragCoord.xy * uNoiseScale).y;
    #endif

    // #pragma unroll_loop_start
    for ( int i = 0; i < NUM_DIRECTIONS; i ++ ) {
      phi = float( i ) * ( PI / float( NUM_DIRECTIONS ) ) + params.x * PI;

      #if ENABLE_ROTATION_JITTER != 0
        phi += rotJitterOffset;
      #endif

      currStep = 1.0 + 0.25 * stepSize * params.y;

      #if ENABLE_RADIUS_JITTER != 0
        currStep += radiusJitterOffset;
      #endif

      dir = vec3( cos( phi ), sin( phi ), 0.0 );
      horizons = vec2( - 1.0 );

      // calculate horizon angles
      for ( int j = 0; j < NUM_STEPS; ++ j ) {
        offset = round( dir.xy * currStep );

        // h1
        // s = GetViewPosition( screenCoord + offset );
        // TODO: getOffsetPositionVS
        s = getPositionVS((screenCoord + offset)/uViewportSize);
        ws = s.xyz - vpos.xyz;

        dist2 = dot( ws, ws );
        invdist = inversesqrt( dist2 );
        cosh = invdist * dot( ws, vdir );

        #if ENABLE_FALLOFF
          falloff = Falloff( dist2 );
        #endif

        horizons.x = max( horizons.x, cosh - falloff );

        #ifdef USE_COLOR_BOUNCE
          vec3 ptColor, ptDir;
          float alpha;
          //ptColor = texture2D( colorBuffer, ( screenCoord + offset ) / renderSize ).rgb;
          ptColor = texture2D( uTexture, ( screenCoord + offset ) / uViewportSize ).rgb;
          ptDir = normalize( ws );
          alpha = saturate( length( ws ) / float( RADIUS ) );
          color += ptColor * saturate( dot( ptDir, vnorm ) ) * pow( ( 1.0 - alpha ), 2.0 );
        #endif

        // h2
        // s = GetViewPosition( screenCoord - offset );
        s = getPositionVS((screenCoord - offset)/uViewportSize);
        ws = s.xyz - vpos.xyz;

        dist2 = dot( ws, ws );
        invdist = inversesqrt( dist2 );
        cosh = invdist * dot( ws, vdir );

        #if ENABLE_FALLOFF
          falloff = Falloff( dist2 );
        #endif

        horizons.y = max( horizons.y, cosh - falloff );

        // increment
        currStep += stepSize;

        #ifdef USE_COLOR_BOUNCE
          // ptColor = texture2D( colorBuffer, ( screenCoord - offset ) / renderSize ).rgb;
          ptColor = texture2D( uTexture, ( screenCoord - offset ) / uViewportSize ).rgb;
          ptDir = normalize( ws );
          alpha = saturate( length( ws ) / float( RADIUS ) );
          color += ptColor * saturate( dot( ptDir, vnorm ) ) * pow( ( 1.0 - alpha ), 2.0 );
        #endif
      }

      horizons = acos( horizons );

      // calculate gamma
      vec3 bitangent	= normalize( cross( dir, vdir ) );
      vec3 tangent	= cross( vdir, bitangent );
      vec3 nx			= vnorm - bitangent * dot( vnorm, bitangent );

      float nnx		= length( nx );
      float invnnx	= 1.0 / ( nnx + 1e-6 );			// to avoid division with zero
      float cosxi		= dot( nx, tangent ) * invnnx;	// xi = gamma + HALF_PI
      float gamma		= acos( cosxi ) - HALF_PI;
      float cosgamma	= dot( nx, vdir ) * invnnx;
      float singamma2	= - 2.0 * cosxi;					// cos(x + HALF_PI) = -sin(x)

      // clamp to normal hemisphere
      horizons.x = gamma + max( - horizons.x - gamma, - HALF_PI );
      horizons.y = gamma + min( horizons.y - gamma, HALF_PI );

      // Riemann integral is additive
      occlusion += nnx * 0.25 * (
        ( horizons.x * singamma2 + cosgamma - cos( 2.0 * horizons.x - gamma ) ) +
        ( horizons.y * singamma2 + cosgamma - cos( 2.0 * horizons.y - gamma ) ) );
    }
    // #pragma unroll_loop_end

    // PDF = 1 / pi and must normalize with pi because of Lambert
    occlusion = occlusion / float( NUM_DIRECTIONS );

    occlusion = clamp(pow(occlusion, 1.0 + uIntensity), 0.0, 1.0);
    // occlusion = 0.25 + 0.75 * occlusion;
  }

  occlusion = clamp(brightnessContrast(occlusion, uBrightness, uContrast), 0.0, 1.0);

  #ifdef USE_COLOR_BOUNCE
    color /= float( NUM_STEPS * NUM_DIRECTIONS ) * 2.0 / uColorBounceIntensity;
    gl_FragColor = vec4(color, occlusion);
  #else
  // gl_FragColor = vec4(0.0, 0.0, 0.0, occlusion);
  gl_FragColor = vec4(occlusion, 0.0, 0.0, 1.0);
  #endif

  ${SHADERS.output.assignment}
}
`;
