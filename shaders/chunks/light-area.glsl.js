export default /* glsl */ `
#if NUM_AREA_LIGHTS > 0

struct AreaLight {
  vec3 position;
  vec4 color;
  vec4 rotation; // TODO: direction?
  vec2 size;
  bool disk;
  bool doubleSided;
};

uniform AreaLight uAreaLights[NUM_AREA_LIGHTS];

// Real-Time Polygonal-Light Shading with Linearly Transformed Cosines.
// Eric Heitz, Jonathan Dupuy, Stephen Hill and David Neubelt.
// ACM Transactions on Graphics (Proceedings of ACM SIGGRAPH 2016) 35(4), 2016.
// Project page: https://eheitzresearch.wordpress.com/415-2/
const bool clipless = false;
const bool groundTruth = false;

uniform sampler2D ltc_1;
uniform sampler2D ltc_2;

const float LUT_SIZE  = 64.0;
const float LUT_SCALE = (LUT_SIZE - 1.0)/LUT_SIZE;
const float LUT_BIAS  = 0.5/LUT_SIZE;

// Disk
const int NUM_SAMPLES = 8;
const int sampleCount = 4;
const float pi = 3.14159265;
const float NO_HIT = 1e9;

struct Ray
{
    vec3 origin;
    vec3 dir;
};

struct Disk
{
    vec3  center;
    vec3  dirx;
    vec3  diry;
    float halfx;
    float halfy;

    vec4  plane;
};

float RayPlaneIntersect(Ray ray, vec4 plane)
{
    float t = -dot(plane, vec4(ray.origin, 1.0))/dot(plane.xyz, ray.dir);
    return (t > 0.0) ? t : NO_HIT;
}

float sqr(float x) { return x*x; }

float RayDiskIntersect(Ray ray, Disk disk)
{
    float t = RayPlaneIntersect(ray, disk.plane);
    if (t != NO_HIT)
    {
        vec3 pos  = ray.origin + ray.dir*t;
        vec3 lpos = pos - disk.center;

        float x = dot(lpos, disk.dirx);
        float y = dot(lpos, disk.diry);

        if (sqr(x/disk.halfx) + sqr(y/disk.halfy) > 1.0)
            t = NO_HIT;
    }

    return t;
}

mat3 mat3_from_columns(vec3 c0, vec3 c1, vec3 c2)
{
    mat3 m = mat3(c0, c1, c2);
    return m;
}

float Halton(int index, float base)
{
    float result = 0.0;
    float f = 1.0/base;
    float i = float(index);
    for (int x = 0; x < 8; x++)
    {
        if (i <= 0.0) break;

        result += f*mod(i, base);
        i = floor(i/base);
        f = f/base;
    }

    return result;
}

void Halton2D(out vec2 s[NUM_SAMPLES], int offset)
{
    for (int i = 0; i < NUM_SAMPLES; i++)
    {
        s[i].x = Halton(i + offset, 2.0);
        s[i].y = Halton(i + offset, 3.0);
    }
}

// TODO: replace this
float rand(vec2 co)
{
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

Disk InitDisk(vec3 center, vec3 dirx, vec3 diry, float halfx, float halfy)
{
    Disk disk;

    disk.center = center;
    disk.dirx   = dirx;
    disk.diry   = diry;
    disk.halfx  = halfx;
    disk.halfy  = halfy;

    vec3 diskNormal = cross(disk.dirx, disk.diry);
    disk.plane = vec4(diskNormal, -dot(diskNormal, disk.center));

    return disk;
}

// An extended version of the implementation from
// "How to solve a cubic equation, revisited"
// http://momentsingraphics.de/?p=105
vec3 SolveCubic(vec4 Coefficient)
{
    // Normalize the polynomial
    Coefficient.xyz /= Coefficient.w;
    // Divide middle coefficients by three
    Coefficient.yz /= 3.0;

    float A = Coefficient.w;
    float B = Coefficient.z;
    float C = Coefficient.y;
    float D = Coefficient.x;

    // Compute the Hessian and the discriminant
    vec3 Delta = vec3(
        -Coefficient.z*Coefficient.z + Coefficient.y,
        -Coefficient.y*Coefficient.z + Coefficient.x,
        dot(vec2(Coefficient.z, -Coefficient.y), Coefficient.xy)
    );

    float Discriminant = dot(vec2(4.0*Delta.x, -Delta.y), Delta.zy);

    vec3 RootsA, RootsD;

    vec2 xlc, xsc;

    // Algorithm A
    {
        float A_a = 1.0;
        float C_a = Delta.x;
        float D_a = -2.0*B*Delta.x + Delta.y;

        // Take the cubic root of a normalized complex number
        float Theta = atan(sqrt(Discriminant), -D_a)/3.0;

        float x_1a = 2.0*sqrt(-C_a)*cos(Theta);
        float x_3a = 2.0*sqrt(-C_a)*cos(Theta + (2.0/3.0)*pi);

        float xl;
        if ((x_1a + x_3a) > 2.0*B)
            xl = x_1a;
        else
            xl = x_3a;

        xlc = vec2(xl - B, A);
    }

    // Algorithm D
    {
        float A_d = D;
        float C_d = Delta.z;
        float D_d = -D*Delta.y + 2.0*C*Delta.z;

        // Take the cubic root of a normalized complex number
        float Theta = atan(D*sqrt(Discriminant), -D_d)/3.0;

        float x_1d = 2.0*sqrt(-C_d)*cos(Theta);
        float x_3d = 2.0*sqrt(-C_d)*cos(Theta + (2.0/3.0)*pi);

        float xs;
        if (x_1d + x_3d < 2.0*C)
            xs = x_1d;
        else
            xs = x_3d;

        xsc = vec2(-D, xs + C);
    }

    float E =  xlc.y*xsc.y;
    float F = -xlc.x*xsc.y - xlc.y*xsc.x;
    float G =  xlc.x*xsc.x;

    vec2 xmc = vec2(C*F - B*G, -B*F + C*E);

    vec3 Root = vec3(xsc.x/xsc.y, xmc.x/xmc.y, xlc.x/xlc.y);

    if (Root.x < Root.y && Root.x < Root.z)
        Root.xyz = Root.yxz;
    else if (Root.z < Root.x && Root.z < Root.y)
        Root.xyz = Root.xzy;

    return Root;
}

vec3 LTC_Evaluate(
    vec3 N, vec3 V, vec3 P, mat3 Minv, vec3 points[4], bool twoSided, float u1, float u2)
{
    // construct orthonormal basis around N
    vec3 T1, T2;
    T1 = normalize(V - N*dot(V, N));
    T2 = cross(N, T1);

    // rotate area light in (T1, T2, N) basis
    mat3 R = transpose(mat3(T1, T2, N));

    // polygon (allocate 5 vertices for clipping)
    vec3 L_[3];
    L_[0] = R * (points[0] - P);
    L_[1] = R * (points[1] - P);
    L_[2] = R * (points[2] - P);

    vec3 Lo_i = vec3(0);

    // init ellipse
    vec3 C  = 0.5 * (L_[0] + L_[2]);
    vec3 V1 = 0.5 * (L_[1] - L_[2]);
    vec3 V2 = 0.5 * (L_[1] - L_[0]);

    C  = Minv * C;
    V1 = Minv * V1;
    V2 = Minv * V2;

    if(!twoSided && dot(cross(V1, V2), C) < 0.0)
        return vec3(0.0);

    // compute eigenvectors of ellipse
    float a, b;
    float d11 = dot(V1, V1);
    float d22 = dot(V2, V2);
    float d12 = dot(V1, V2);
    if (abs(d12)/sqrt(d11*d22) > 0.0001)
    {
        float tr = d11 + d22;
        float det = -d12*d12 + d11*d22;

        // use sqrt matrix to solve for eigenvalues
        det = sqrt(det);
        float u = 0.5*sqrt(tr - 2.0*det);
        float v = 0.5*sqrt(tr + 2.0*det);
        float e_max = sqr(u + v);
        float e_min = sqr(u - v);

        vec3 V1_, V2_;

        if (d11 > d22)
        {
            V1_ = d12*V1 + (e_max - d11)*V2;
            V2_ = d12*V1 + (e_min - d11)*V2;
        }
        else
        {
            V1_ = d12*V2 + (e_max - d22)*V1;
            V2_ = d12*V2 + (e_min - d22)*V1;
        }

        a = 1.0 / e_max;
        b = 1.0 / e_min;
        V1 = normalize(V1_);
        V2 = normalize(V2_);
    }
    else
    {
        a = 1.0 / dot(V1, V1);
        b = 1.0 / dot(V2, V2);
        V1 *= sqrt(a);
        V2 *= sqrt(b);
    }

    vec3 V3 = cross(V1, V2);
    if (dot(C, V3) < 0.0)
        V3 *= -1.0;

    float L  = dot(V3, C);
    float x0 = dot(V1, C) / L;
    float y0 = dot(V2, C) / L;

    float E1 = inversesqrt(a);
    float E2 = inversesqrt(b);

    a *= L*L;
    b *= L*L;

    float c0 = a*b;
    float c1 = a*b*(1.0 + x0*x0 + y0*y0) - a - b;
    float c2 = 1.0 - a*(1.0 + x0*x0) - b*(1.0 + y0*y0);
    float c3 = 1.0;

    vec3 roots = SolveCubic(vec4(c0, c1, c2, c3));
    float e1 = roots.x;
    float e2 = roots.y;
    float e3 = roots.z;

    vec3 avgDir = vec3(a*x0/(a - e2), b*y0/(b - e2), 1.0);

    mat3 rotate = mat3_from_columns(V1, V2, V3);

    avgDir = rotate*avgDir;
    avgDir = normalize(avgDir);

    float L1 = sqrt(-e2/e3);
    float L2 = sqrt(-e2/e1);

    float formFactor = L1*L2*inversesqrt((1.0 + L1*L1)*(1.0 + L2*L2));

    // use tabulated horizon-clipped sphere
    vec2 uv = vec2(avgDir.z*0.5 + 0.5, formFactor);
    uv = uv*LUT_SCALE + LUT_BIAS;
    float scale = texture(ltc_2, uv).w;

    float spec = formFactor*scale;

    if (groundTruth)
    {
        spec = 0.0;

        float diskArea = pi*E1*E2;

        // light sample
        {
            // random point on ellipse
            float rad = sqrt(u1);
            float phi = 2.0*pi*u2;
            float x = E1*rad*cos(phi);
            float y = E2*rad*sin(phi);

            vec3 p = x*V1 + y*V2 + C;
            vec3 v = normalize(p);

            float c2 = max(dot(V3, v), 0.0);
            float solidAngle = max(c2/dot(p, p), 1e-7);
            float pdfLight = 1.0/solidAngle/diskArea;

            float cosTheta = max(v.z, 0.0);
            float brdf = 1.0/pi;
            float pdfBRDF = cosTheta/pi;

            if (cosTheta > 0.0)
                spec += brdf*cosTheta/(pdfBRDF + pdfLight);
        }

        // BRDF sample
        {
            // generate a cosine-distributed direction
            float rad = sqrt(u1);
            float phi = 2.0*pi*u2;
            float x = rad*cos(phi);
            float y = rad*sin(phi);
            vec3 dir = vec3(x, y, sqrt(1.0 - u1));

            Ray ray;
            ray.origin = vec3(0, 0, 0);
            ray.dir = dir;

            Disk disk = InitDisk(C, V1, V2, E1, E2);

            vec3 diskNormal = V3;
            disk.plane = vec4(diskNormal, -dot(diskNormal, disk.center));

            float distToDisk = RayDiskIntersect(ray, disk);
            bool  intersect  = distToDisk != NO_HIT;

            float cosTheta = max(dir.z, 0.0);
            float brdf = 1.0/pi;
            float pdfBRDF = cosTheta/pi;

            float pdfLight = 0.0;
            if (intersect)
            {
                vec3 p = distToDisk*ray.dir;
                vec3 v = normalize(p);
                float c2 = max(dot(V3, v), 0.0);
                float solidAngle = max(c2/dot(p, p), 1e-7);
                pdfLight = 1.0/solidAngle/diskArea;
            }

            if (intersect)
                spec += brdf*cosTheta/(pdfBRDF + pdfLight);
        }
    }

    Lo_i = vec3(spec, spec, spec);

    return vec3(Lo_i);
}

// Quad
vec3 IntegrateEdgeVec(vec3 v1, vec3 v2)
{
    float x = dot(v1, v2);
    float y = abs(x);

    float a = 0.8543985 + (0.4965155 + 0.0145206*y)*y;
    float b = 3.4175940 + (4.1616724 + y)*y;
    float v = a / b;

    float theta_sintheta = (x > 0.0) ? v : 0.5*inversesqrt(max(1.0 - x*x, 1e-7)) - v;

    return cross(v1, v2)*theta_sintheta;
}

float IntegrateEdge(vec3 v1, vec3 v2)
{
    return IntegrateEdgeVec(v1, v2).z;
}

void ClipQuadToHorizon(inout vec3 L[5], out int n)
{
    // detect clipping config
    int config = 0;
    if (L[0].z > 0.0) config += 1;
    if (L[1].z > 0.0) config += 2;
    if (L[2].z > 0.0) config += 4;
    if (L[3].z > 0.0) config += 8;

    // clip
    n = 0;

    if (config == 0)
    {
        // clip all
    }
    else if (config == 1) // V1 clip V2 V3 V4
    {
        n = 3;
        L[1] = -L[1].z * L[0] + L[0].z * L[1];
        L[2] = -L[3].z * L[0] + L[0].z * L[3];
    }
    else if (config == 2) // V2 clip V1 V3 V4
    {
        n = 3;
        L[0] = -L[0].z * L[1] + L[1].z * L[0];
        L[2] = -L[2].z * L[1] + L[1].z * L[2];
    }
    else if (config == 3) // V1 V2 clip V3 V4
    {
        n = 4;
        L[2] = -L[2].z * L[1] + L[1].z * L[2];
        L[3] = -L[3].z * L[0] + L[0].z * L[3];
    }
    else if (config == 4) // V3 clip V1 V2 V4
    {
        n = 3;
        L[0] = -L[3].z * L[2] + L[2].z * L[3];
        L[1] = -L[1].z * L[2] + L[2].z * L[1];
    }
    else if (config == 5) // V1 V3 clip V2 V4) impossible
    {
        n = 0;
    }
    else if (config == 6) // V2 V3 clip V1 V4
    {
        n = 4;
        L[0] = -L[0].z * L[1] + L[1].z * L[0];
        L[3] = -L[3].z * L[2] + L[2].z * L[3];
    }
    else if (config == 7) // V1 V2 V3 clip V4
    {
        n = 5;
        L[4] = -L[3].z * L[0] + L[0].z * L[3];
        L[3] = -L[3].z * L[2] + L[2].z * L[3];
    }
    else if (config == 8) // V4 clip V1 V2 V3
    {
        n = 3;
        L[0] = -L[0].z * L[3] + L[3].z * L[0];
        L[1] = -L[2].z * L[3] + L[3].z * L[2];
        L[2] =  L[3];
    }
    else if (config == 9) // V1 V4 clip V2 V3
    {
        n = 4;
        L[1] = -L[1].z * L[0] + L[0].z * L[1];
        L[2] = -L[2].z * L[3] + L[3].z * L[2];
    }
    else if (config == 10) // V2 V4 clip V1 V3) impossible
    {
        n = 0;
    }
    else if (config == 11) // V1 V2 V4 clip V3
    {
        n = 5;
        L[4] = L[3];
        L[3] = -L[2].z * L[3] + L[3].z * L[2];
        L[2] = -L[2].z * L[1] + L[1].z * L[2];
    }
    else if (config == 12) // V3 V4 clip V1 V2
    {
        n = 4;
        L[1] = -L[1].z * L[2] + L[2].z * L[1];
        L[0] = -L[0].z * L[3] + L[3].z * L[0];
    }
    else if (config == 13) // V1 V3 V4 clip V2
    {
        n = 5;
        L[4] = L[3];
        L[3] = L[2];
        L[2] = -L[1].z * L[2] + L[2].z * L[1];
        L[1] = -L[1].z * L[0] + L[0].z * L[1];
    }
    else if (config == 14) // V2 V3 V4 clip V1
    {
        n = 5;
        L[4] = -L[0].z * L[3] + L[3].z * L[0];
        L[0] = -L[0].z * L[1] + L[1].z * L[0];
    }
    else if (config == 15) // V1 V2 V3 V4
    {
        n = 4;
    }

    if (n == 3)
        L[3] = L[0];
    if (n == 4)
        L[4] = L[0];
}

vec3 LTC_Evaluate(
    vec3 N, vec3 V, vec3 P, mat3 Minv, vec3 points[4], bool twoSided)
{
    // construct orthonormal basis around N
    vec3 T1, T2;
    T1 = normalize(V - N*dot(V, N));
    T2 = cross(N, T1);

    // rotate area light in (T1, T2, N) basis
    Minv = Minv * transpose(mat3(T1, T2, N));

    // polygon (allocate 5 vertices for clipping)
    vec3 L[5];
    L[0] = Minv * (points[0] - P);
    L[1] = Minv * (points[1] - P);
    L[2] = Minv * (points[2] - P);
    L[3] = Minv * (points[3] - P);

    // integrate
    float sum = 0.0;

    if (clipless)
    {
        vec3 dir = points[0].xyz - P;
        vec3 lightNormal = cross(points[1] - points[0], points[3] - points[0]);
        bool behind = (dot(dir, lightNormal) < 0.0);

        L[0] = normalize(L[0]);
        L[1] = normalize(L[1]);
        L[2] = normalize(L[2]);
        L[3] = normalize(L[3]);

        vec3 vsum = vec3(0.0);

        vsum += IntegrateEdgeVec(L[0], L[1]);
        vsum += IntegrateEdgeVec(L[1], L[2]);
        vsum += IntegrateEdgeVec(L[2], L[3]);
        vsum += IntegrateEdgeVec(L[3], L[0]);

        float len = length(vsum);
        float z = vsum.z/len;

        if (behind)
            z = -z;

        vec2 uv = vec2(z*0.5 + 0.5, len);
        uv = uv*LUT_SCALE + LUT_BIAS;

        float scale = texture(ltc_2, uv).w;

        sum = len*scale;

        if (behind && !twoSided)
            sum = 0.0;
    }
    else
    {
        int n;
        ClipQuadToHorizon(L, n);

        if (n == 0)
            return vec3(0, 0, 0);
        // project onto sphere
        L[0] = normalize(L[0]);
        L[1] = normalize(L[1]);
        L[2] = normalize(L[2]);
        L[3] = normalize(L[3]);
        L[4] = normalize(L[4]);

        // integrate
        sum += IntegrateEdge(L[0], L[1]);
        sum += IntegrateEdge(L[1], L[2]);
        sum += IntegrateEdge(L[2], L[3]);
        if (n >= 4)
            sum += IntegrateEdge(L[3], L[4]);
        if (n == 5)
            sum += IntegrateEdge(L[4], L[0]);

        sum = twoSided ? abs(sum) : max(0.0, sum);
    }

    vec3 Lo_i = vec3(sum, sum, sum);

    return Lo_i;
}

void EvaluateAreaLight(inout PBRData data, AreaLight light, float ao) {
  vec3 pos = data.positionWorld;
  vec3 N = data.normalWorld;
  vec3 V = -normalize(pos - uCameraPosition);
  float roughness = data.roughness;

  vec3 ex = multQuat(vec3(1, 0, 0), light.rotation) * light.size.x;
  vec3 ey = multQuat(vec3(0, 1, 0), light.rotation) * light.size.y;

  vec3 points[4];
  points[0] = light.position - ex + ey;
  points[1] = light.position + ex + ey;
  points[2] = light.position + ex - ey;
  points[3] = light.position - ex - ey;

  float u1;
  float u2;
  if (light.disk) {
    vec2 seq[NUM_SAMPLES];
    Halton2D(seq, sampleCount);

    u1 = rand(gl_FragCoord.xy*0.01);
    u2 = rand(gl_FragCoord.yx*0.01);

    u1 = fract(u1 + seq[0].x);
    u2 = fract(u2 + seq[0].y);
  }

  float ndotv = saturate(dot(N, V));
  vec2 uv = vec2(roughness, sqrt(1.0 - ndotv));
  uv = uv * LUT_SCALE + LUT_BIAS;

  vec4 t1 = texture2D(ltc_1, uv);
  vec4 t2 = texture2D(ltc_2, uv);

  mat3 Minv = mat3(
    vec3(t1.x, 0, t1.y),
    vec3(  0,  1,    0),
    vec3(t1.z, 0, t1.w)
  );

  vec3 spec = light.disk
    ? LTC_Evaluate(N, V, pos, Minv, points, light.doubleSided, u1, u2)
    : LTC_Evaluate(N, V, pos, Minv, points, light.doubleSided);
  spec *= data.f0 * t2.x + (1.0 - data.f0) * t2.y;

  vec3 diff = light.disk
    ? LTC_Evaluate(N, V, pos, mat3(1), points, light.doubleSided, u1, u2)
    : LTC_Evaluate(N, V, pos, mat3(1), points, light.doubleSided);

  // spec *= scol * t2.x + (1.0 - scol) * t2.y;
  // col = lcol*(spec + dcol*diff);
  // data.indirectSpecular += ao * col;

  vec3 lightColor = decode(light.color, 3).rgb;
  data.directColor += ao * lightColor * data.baseColor * diff;
  data.indirectSpecular += ao * lightColor * spec;
}
#endif
`;
