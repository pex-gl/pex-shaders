export default /* glsl */ `
#ifdef USE_SHEEN
    uniform vec4 uSheenColor; // TODO: gltf assumes sRGB color, not linear
    uniform float uSheenRoughness;

    #ifdef USE_SHEEN_COLOR_TEXTURE
    uniform sampler2D uSheenColorTexture; // assumes sRGB color, not linear

    #ifdef USE_SHEEN_COLOR_TEXTURE_MATRIX
        uniform mat3 uSheenColorTextureMatrix;
    #endif

    void getSheenColor(inout PBRData data) {
        #ifdef USE_SHEEN_COLOR_TEXTURE_MATRIX
        vec2 texCoord = getTextureCoordinates(data, SHEEN_COLOR_TEXTURE_TEX_COORD, uSheenColorTextureMatrix);
        #else
        vec2 texCoord = getTextureCoordinates(data, SHEEN_COLOR_TEXTURE_TEX_COORD);
        #endif
        vec4 texelColor = texture2D(uSheenColorTexture, texCoord);

        #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
        data.sheenColor = decode(uSheenColor, 3).rgb * decode(texelColor, 3).rgb;
        data.sheenRoughness = uSheenRoughness * texelColor.a;
        #endif
    }
    #else
    void getSheenColor(inout PBRData data) {
        #if !defined(DEPTH_PASS_ONLY) && !defined(DEPTH_PRE_PASS_ONLY)
        data.sheenColor = decode(uSheenColor, 3).rgb;
        #endif
        data.sheenRoughness = uSheenRoughness;
    }
    #endif

    float Sheen_l(float x, float alphaG) {
        float oneMinusAlphaSq = (1.0 - alphaG) * (1.0 - alphaG);
        float a = mix(21.5473, 25.3245, oneMinusAlphaSq);
        float b = mix(3.82987, 3.32435, oneMinusAlphaSq);
        float c = mix(0.19823, 0.16801, oneMinusAlphaSq);
        float d = mix(-1.97760, -1.27393, oneMinusAlphaSq);
        float e = mix(-4.32054, -4.85967, oneMinusAlphaSq);
        return a / (1.0 + b * pow(x, c)) + d * x + e;
    }

    float lambdaSheen(float cosTheta, float alphaG) {
        return abs(cosTheta) < 0.5 ? exp(Sheen_l(cosTheta, alphaG)) : exp(2.0 * Sheen_l(0.5, alphaG) - Sheen_l(1.0 - cosTheta, alphaG));
    }

    vec3 EvaluateSheen(inout PBRData data, float NdotH, float NdotV, float NdotL) {
        float alphaG = data.sheenRoughness * data.sheenRoughness;
        float invR = 1.0 / alphaG;

        float cos2h = NdotH * NdotH;
        float sin2h = 1.0 - cos2h;
        float sheenDistribution = (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * PI);

        float sheenVisibility = 1.0 / ((1.0 + lambdaSheen(NdotV, alphaG) + lambdaSheen(NdotL, alphaG)) * (4.0 * NdotV * NdotL));
        float sheenFresnel = 1.0;
        vec3 sheen = data.sheenColor * sheenFresnel * sheenDistribution * sheenVisibility;
        data.sheen += sheen;

        return sheen;

        // TODO: add albedo scaling
        // https://github.com/KhronosGroup/glTF/blob/master/extensions/2.0/Khronos/KHR_materials_sheen/README.md#albedo-scaling-technique
    }
#endif
`;
