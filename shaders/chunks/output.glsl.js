const texture = /* glsl */ `
  #define texture2D texture
  #define textureCube texture
  #define texture2DProj textureProj
`;

const vert = /* glsl */ `
#if (__VERSION__ >= 300)
  #define attribute in
  #define varying out
  ${texture}
#endif
`;

const frag = /* glsl */ `
#if (__VERSION__ >= 300)
  #define varying in
  ${texture}

  // EXT_frag_depth
  #define gl_FragDepthEXT gl_FragDepth

  // EXT_shader_texture_lod
  #define texture2DLodEXT textureLod
  #define texture2DProjLodEXT textureProjLod
  #define textureCubeLodEXT textureLod
  #define texture2DGradEXT textureGrad
  #define texture2DProjGradEXT textureProjGrad
  #define textureCubeGradEXT textureGrad

  vec4 FragData[3];
  #define gl_FragData FragData
  #define gl_FragColor gl_FragData[0]

  layout (location = 0) out vec4 outColor;
  layout (location = 1) out vec4 outEmissiveColor;
  layout (location = 2) out vec4 outNormal;
#endif
`;

const assignment = /* glsl */ `
#if (__VERSION__ >= 300)
  outColor = FragData[0];
  outEmissiveColor = FragData[1];
  outNormal = FragData[2];
#endif
`;

export default { vert, frag, assignment };
