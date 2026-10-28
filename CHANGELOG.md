# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

# [3.0.0-alpha.2](https://github.com/pex-gl/pex-shaders/compare/v3.0.0-alpha.1...v3.0.0-alpha.2) (2026-10-28)

### Bug Fixes

* TAA disocclusion for orthographic and infinite far projections ([8923e03](https://github.com/pex-gl/pex-shaders/commit/8923e039771939c81fbde77554c3af3dd9d1a41c))

### Features

* add fog maxOpacity ([ecec435](https://github.com/pex-gl/pex-shaders/commit/ecec4355240c0ef941d35d0337bb95f6e733ce1c))
* linearize depth through the inverse projection ([2127900](https://github.com/pex-gl/pex-shaders/commit/2127900bffb52a0b720d412a5bc3d78d13d7b89d))
* support orthographic projections in GTAO and SAO ([5e50f11](https://github.com/pex-gl/pex-shaders/commit/5e50f1104a7f949873aed2058dd516706debf30e))
* use inverseProjectionMatrix in reconstructPositionFromDepth for fog ([da7a437](https://github.com/pex-gl/pex-shaders/commit/da7a4371c7dac7fc303c7f58ab6bdb1b7fc8c6f9))

# [3.0.0-alpha.1](https://github.com/pex-gl/pex-shaders/compare/v3.0.0-alpha.0...v3.0.0-alpha.1) (2026-09-24)

### Features

* use SceneLight for shared buffer support ([b2a4fde](https://github.com/pex-gl/pex-shaders/commit/b2a4fdeade993bf7f0c9a0c32a17badc01a5dd00))
* use wgsl-smaa ([3ec8f70](https://github.com/pex-gl/pex-shaders/commit/3ec8f70ffe3a97ad33ab3e457a79212ef42ae3b3))

# [3.0.0-alpha.0](https://github.com/pex-gl/pex-shaders/compare/v2.0.0...v3.0.0-alpha.0) (2026-09-16)


### Bug Fixes

* adjust near dof + get closer to FFX/Unity implementation ([b8b940e](https://github.com/pex-gl/pex-shaders/commit/b8b940eef10c7e79e10b73449d19cdd6e3cdc5a1))
* correct specular textures handling ([faf52b6](https://github.com/pex-gl/pex-shaders/commit/faf52b69f863d5f9079fffb5b4b355cb6a353b64))
* correct y value for getTransmissionSample ([9b65a03](https://github.com/pex-gl/pex-shaders/commit/9b65a03d442887719549787fe08a9e5094204ffa))
* dof near blockiness and halo ([0a849c7](https://github.com/pex-gl/pex-shaders/commit/0a849c76223642b9ddda198a5a8f0c992a46c22d))
* handle permutations of diffuseTransmissionTexture and diffuseTransmissionColorTexture ([555a68e](https://github.com/pex-gl/pex-shaders/commit/555a68ea4582799faacad9ec5a139e5ee67580e1))
* prevent double-counting the multiple-scattering term ([d0b55dd](https://github.com/pex-gl/pex-shaders/commit/d0b55dda7e610482d88c97e9cd3944136258a03e))
* solve TBN against geometric normal, not shading normal ([e679b86](https://github.com/pex-gl/pex-shaders/commit/e679b861cd3658b41ffbc16d4a489729ea95abba))
* split ssao multiBounce "analytic" vs. "screen-space" ([1be9a4c](https://github.com/pex-gl/pex-shaders/commit/1be9a4ca14df5f19197b05512faed79878fc9287))
* use f90 (specularFactor) for direct light ([c2c6343](https://github.com/pex-gl/pex-shaders/commit/c2c63435609e156cc14703c5a87b9866328ebfff))


### Features

* add diffuse irradiance via L2 spherical harmonics + specular via native prefiltered cubemap ([f721325](https://github.com/pex-gl/pex-shaders/commit/f7213255837588a21ff48d6306ef0ae7c352b27d))
* add direct lighting energy compensation ([2e89b82](https://github.com/pex-gl/pex-shaders/commit/2e89b82aadcf80837ba6f2902d4572c48655f172))
* add disocclusion rejection to TAA ([1bb2a8c](https://github.com/pex-gl/pex-shaders/commit/1bb2a8c8a5cb0e2cf0e549d98a8b0d01139fb44a))
* add Fdez-Agüera multiple-scattering energy compensation ([9a54128](https://github.com/pex-gl/pex-shaders/commit/9a541280f22b3b7626c90ed9fdc6404e8a165a07))
* add Karis reconstruction filtering of the current sample in the TAA resolve + add taa debug ([3fdcc3e](https://github.com/pex-gl/pex-shaders/commit/3fdcc3e6fb89d2e5f8c606e1f606e792924f4a1f))
* add lens flare ([5e5fae4](https://github.com/pex-gl/pex-shaders/commit/5e5fae4ff051f14fe334bc86fd0d691c6de0b4a0))
* add luminanceKnee and depthOffset to DoF + fix sampling CoC ([cbea211](https://github.com/pex-gl/pex-shaders/commit/cbea21177ca202501b50847f0f54a4c5d819305d))
* add motion blur ([9284550](https://github.com/pex-gl/pex-shaders/commit/92845504c92f9d7ddbf9ab8ef5578f5de54c4214))
* add sharpen ([99a4b1e](https://github.com/pex-gl/pex-shaders/commit/99a4b1e042820aa1f3b193eb8c6ebece82d8d472))
* add softKnee to threshold ([d544785](https://github.com/pex-gl/pex-shaders/commit/d5447850ccdd5157160a74ed81774d5381071c69))
* add TAA ([dbbbf1a](https://github.com/pex-gl/pex-shaders/commit/dbbbf1aec67cd2be0a52dcc944895233f1b28252))
* chunkify remaining post-pro ([bacb78e](https://github.com/pex-gl/pex-shaders/commit/bacb78e353abe12f6359e90bec69d4d3f41e063d))
* decouple transmission from light probe ([81a6508](https://github.com/pex-gl/pex-shaders/commit/81a6508c570c378a8008f58b2ae3def5424cbb20))
* make sky return linear HDR radiance ([6c69560](https://github.com/pex-gl/pex-shaders/commit/6c69560e91c7466096149c2db0cae5c7f2aa2acf))
* move point/directional/spot to hardware pcf + correct PCSS implementation + remove pipeline shaders ([ed339db](https://github.com/pex-gl/pex-shaders/commit/ed339dbf1744dd0894b002ab7170dbfb31b57e28))
* move to shadowBucket + shadowLayer ([03bef2e](https://github.com/pex-gl/pex-shaders/commit/03bef2e082063b6611046c68e26dfda945f8c649))
* port and move analytic sky to chunk ([e137df0](https://github.com/pex-gl/pex-shaders/commit/e137df068fb050d05a3f4854e2280e31d7c094f8))
* port pipeline and chunks to WGSL ([79d9494](https://github.com/pex-gl/pex-shaders/commit/79d949475fe71617badb2c5855154fb9f72ba43d))
* remove custom exposure from dof and lens-flare ([d08bb19](https://github.com/pex-gl/pex-shaders/commit/d08bb199e4d9202a8d45941880ffb1a86cc289e8))
* rename emissiveIntensity to emissiveStrength ([eb5e01a](https://github.com/pex-gl/pex-shaders/commit/eb5e01a9fbc0a2c80a8d3f5bf212297abacb7924))
* upgrade depth of field ([97ffa40](https://github.com/pex-gl/pex-shaders/commit/97ffa402acb8db67ccca75898372270667a41484))
* upgrade gtao ([8d10f51](https://github.com/pex-gl/pex-shaders/commit/8d10f51df1b9319060dd7ae6bb1fe78079e9a070))
* upgrade SAO ([f3712f7](https://github.com/pex-gl/pex-shaders/commit/f3712f7a0693bed49ce3282b4a510e9c7093e6d8))
* use physical light units ([a329147](https://github.com/pex-gl/pex-shaders/commit/a329147d7544640005bfd1fa7ca17fbebb1c1dc0))
* use reflection probe rotation and intensity in chunk ([51aac0d](https://github.com/pex-gl/pex-shaders/commit/51aac0d270a18489db23a4b8de97a2623c140495))
* use velocity for TAA ([54e285e](https://github.com/pex-gl/pex-shaders/commit/54e285ede4e1a3945e5ee2c62afbb3e6d6201811))
* use WebGPU +Y convention in envMapEquirect ([8736c85](https://github.com/pex-gl/pex-shaders/commit/8736c85de29f4af85763ea3c03604c6b589ecb64))



# [2.0.0](https://github.com/pex-gl/pex-shaders/compare/v2.0.0-alpha.6...v2.0.0) (2026-07-31)



# [2.0.0-alpha.6](https://github.com/pex-gl/pex-shaders/compare/v2.0.0-alpha.5...v2.0.0-alpha.6) (2026-04-16)


### Bug Fixes

* prevent negative, NaN or Infinity color in basic and line shader ([ce23d2b](https://github.com/pex-gl/pex-shaders/commit/ce23d2b68e3ed8b92baaf3e828d1191d06fec755))
* prevent negative, NaN or Infinity color in standard shader ([c0bf772](https://github.com/pex-gl/pex-shaders/commit/c0bf772b172c86e0725fe5190cc1299d1fc7c641))


### Features

* **main:** use the correct srgb transfer function ([3bac8ee](https://github.com/pex-gl/pex-shaders/commit/3bac8ee156083ae170c3702e22ec7957ac869a92)), closes [#29](https://github.com/pex-gl/pex-shaders/issues/29)



# [2.0.0-alpha.5](https://github.com/pex-gl/pex-shaders/compare/v2.0.0-alpha.4...v2.0.0-alpha.5) (2026-02-26)


### Bug Fixes

* use ortho projection for reading depth only for directional light ([25c4df6](https://github.com/pex-gl/pex-shaders/commit/25c4df64c17f6495afdd64a4927a961294f99d1c))



# [2.0.0-alpha.4](https://github.com/pex-gl/pex-shaders/compare/v2.0.0-alpha.3...v2.0.0-alpha.4) (2025-09-19)



# [2.0.0-alpha.3](https://github.com/pex-gl/pex-shaders/compare/v2.0.0-alpha.2...v2.0.0-alpha.3) (2025-09-12)


### Features

* add glsl-smaa ([4086984](https://github.com/pex-gl/pex-shaders/commit/4086984207a5e5af05fba897488e128f7072c263))
* read luma texture in film grain ([2744881](https://github.com/pex-gl/pex-shaders/commit/2744881bce63cf6d3e32d3d826fa0ecca248bf47))



# [2.0.0-alpha.2](https://github.com/pex-gl/pex-shaders/compare/v2.0.0-alpha.1...v2.0.0-alpha.2) (2025-09-09)


### Features

* **main:** make post-processing combine and final decode SRGB ([fe2f4cc](https://github.com/pex-gl/pex-shaders/commit/fe2f4cc07482a200909130a5da48ae3950299698))
* make blit encode to SRGB ([3ee1afa](https://github.com/pex-gl/pex-shaders/commit/3ee1afa5f64cd00e6c07dae372a7036fa26212aa))
* remove RGBM from encode decode ([15b8d40](https://github.com/pex-gl/pex-shaders/commit/15b8d4027db17e46d57c88ac2ee6ce33bd06a799))
* split blit and reversible tone map passes ([1732e0f](https://github.com/pex-gl/pex-shaders/commit/1732e0f8f0596ec502a39a93ed4f9da23c6baa7d))



# [2.0.0-alpha.1](https://github.com/pex-gl/pex-shaders/compare/v2.0.0-alpha.0...v2.0.0-alpha.1) (2025-09-08)


### Features

* remove encoding/decoding + remove exposure/toneMap + add msaa define instead ([8c53609](https://github.com/pex-gl/pex-shaders/commit/8c53609fcc934dda0950d1f5d1594da57f4dbd39))



# [2.0.0-alpha.0](https://github.com/pex-gl/pex-shaders/compare/v1.0.0...v2.0.0-alpha.0) (2025-09-05)


### Features

* add post-processing luma + use it in fxaa ([bb3ed8d](https://github.com/pex-gl/pex-shaders/commit/bb3ed8d05bb74359ad1ee98ee31182b20f0905ba))
* add reversible tone map ([09032b7](https://github.com/pex-gl/pex-shaders/commit/09032b7e83df19ad3a54da3c3a6f0d49fb9e3832))
* assume colors in perceptual space for FXAA ([21d17f5](https://github.com/pex-gl/pex-shaders/commit/21d17f5e00a85972aef0c61500c2b2db3a767d19))
* assume LinearSRGB input texture for fxaa in final ([b30f7a8](https://github.com/pex-gl/pex-shaders/commit/b30f7a8e3a6b8c050d2d28b0af199db5353337a4))
* move vignette before LUT/Color Correction ([91e854d](https://github.com/pex-gl/pex-shaders/commit/91e854d261db3f45057e99a31276abe02d9ff10b))
* remove SRGB textures decoding ([3c31dd9](https://github.com/pex-gl/pex-shaders/commit/3c31dd92eee156017ea4e8c286992ed8006ee442)), closes [#27](https://github.com/pex-gl/pex-shaders/issues/27)
* split post-processing combine and final ([c0a98f6](https://github.com/pex-gl/pex-shaders/commit/c0a98f628573e57de4f31e33461d15cff159c534))



# [1.0.0](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.34...v1.0.0) (2025-08-22)


### Features

* unpack instanced attributes before hook in standard vertex shader ([eafca80](https://github.com/pex-gl/pex-shaders/commit/eafca8077faf15f2203cd30a79b9acbf36efd801)), closes [#25](https://github.com/pex-gl/pex-shaders/issues/25)



# [1.0.0-alpha.34](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.33...v1.0.0-alpha.34) (2025-03-18)


### Bug Fixes

* check for attenuationDistance at infinity ([06bd896](https://github.com/pex-gl/pex-shaders/commit/06bd8968510949fab4b9f87e6ed98235d29a0251))
* decode specular color texture as SRGB ([d6c75b2](https://github.com/pex-gl/pex-shaders/commit/d6c75b2499698330c8baad6b6fa53f807f15b506))


### Features

* add diffuse transmission ([25cd99c](https://github.com/pex-gl/pex-shaders/commit/25cd99cbf6ed6ac12be667c33b9632956f81a83d))


### Performance Improvements

* remove transpose call from quatToMat4 ([14419a2](https://github.com/pex-gl/pex-shaders/commit/14419a2ac781e1ecea5c589aa57efa2efb67df32)), closes [#23](https://github.com/pex-gl/pex-shaders/issues/23)



# [1.0.0-alpha.33](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.32...v1.0.0-alpha.33) (2024-09-19)


### Features

* remove fxaa 2 ([34d5025](https://github.com/pex-gl/pex-shaders/commit/34d502563c135fd0a59b9173ac5682d29b6184c0))



# [1.0.0-alpha.32](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.31...v1.0.0-alpha.32) (2024-09-17)


### Bug Fixes

* saturate film grain result ([9647966](https://github.com/pex-gl/pex-shaders/commit/96479669729bedf1de895d6148a404a495597e5f))


### Features

* parametrize fxaa3 ([43fcade](https://github.com/pex-gl/pex-shaders/commit/43fcadea658660914b3cc2b93a567297c5f4d9c4))



# [1.0.0-alpha.31](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.30...v1.0.0-alpha.31) (2024-06-06)


### Bug Fixes

* add missing f90 parameter to EnvBRDFApprox ([c628c28](https://github.com/pex-gl/pex-shaders/commit/c628c28a06d0f4214075d664af2015f21c5019a8))



# [1.0.0-alpha.30](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.29...v1.0.0-alpha.30) (2024-05-29)


### Bug Fixes

* correct DepthGradient for PCSS ([97ed2ae](https://github.com/pex-gl/pex-shaders/commit/97ed2ae5a48fc79a4c67d9b18536ed387238657c))



# [1.0.0-alpha.29](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.28...v1.0.0-alpha.29) (2024-05-20)


### Bug Fixes

* change order of hook execution ([d2a49c6](https://github.com/pex-gl/pex-shaders/commit/d2a49c65054624d46bfd010394277808a484d80b)), closes [#17](https://github.com/pex-gl/pex-shaders/issues/17)



# [1.0.0-alpha.28](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.27...v1.0.0-alpha.28) (2024-05-16)


### Bug Fixes

* move HOOK_FRAG_BEFORE_LIGHTING before reflection probes and after setting all PBRData ([a459bfb](https://github.com/pex-gl/pex-shaders/commit/a459bfb3ad93143eac7c4dd0de679b6c151ab69c)), closes [#17](https://github.com/pex-gl/pex-shaders/issues/17)
* use perceptual roughness in getTransmissionSample ([218392a](https://github.com/pex-gl/pex-shaders/commit/218392a145fbd942cdc6cbba07b6b5c3ff64f47d))



# [1.0.0-alpha.27](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.26...v1.0.0-alpha.27) (2024-05-03)


### Bug Fixes

* add transmission support for area lights ([9ccc45b](https://github.com/pex-gl/pex-shaders/commit/9ccc45b0215dcf54a848940a5459e79f94af2f0e))



# [1.0.0-alpha.26](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.25...v1.0.0-alpha.26) (2024-05-03)


### Features

* add transmission with volume/dispersion + add ior and specular ([a43e276](https://github.com/pex-gl/pex-shaders/commit/a43e27671062163bc90254f8e2be07bf5bf7b4f1))
* remove old transmission aka refraction only ([0491517](https://github.com/pex-gl/pex-shaders/commit/049151760bfaa1cf8334fe80d48c140c6a41b2ec))
* remove reflectance in favor of ior ([c53dfd2](https://github.com/pex-gl/pex-shaders/commit/c53dfd28be79e0ac781abc68ef492b50c1c83082))
* use bicubic sampling for transmission ([f051937](https://github.com/pex-gl/pex-shaders/commit/f051937f5035d2212a9a59cb85118715201188f8)), closes [#15](https://github.com/pex-gl/pex-shaders/issues/15)



# [1.0.0-alpha.25](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.24...v1.0.0-alpha.25) (2024-04-05)


### Bug Fixes

* prevent ssao overwriting aa and fog ([19ccf06](https://github.com/pex-gl/pex-shaders/commit/19ccf062d4705268e539111642cf4a4e86c01c96))



# [1.0.0-alpha.24](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.23...v1.0.0-alpha.24) (2024-04-02)


### Features

* add ssao mix ([ffd3043](https://github.com/pex-gl/pex-shaders/commit/ffd3043df9d27bf5130dbb81e7374ba0a24826ea))



# [1.0.0-alpha.23](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.22...v1.0.0-alpha.23) (2024-03-05)


### Bug Fixes

* ensure disk area light doesn't produce negative values ([77bea51](https://github.com/pex-gl/pex-shaders/commit/77bea51cd745faede22a408ac568cd68eff49fcd)), closes [#13](https://github.com/pex-gl/pex-shaders/issues/13)



# [1.0.0-alpha.22](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.21...v1.0.0-alpha.22) (2024-02-14)


### Features

* always use ssao as post effect only ([67747a8](https://github.com/pex-gl/pex-shaders/commit/67747a8be503dab729725473773a3532b39ef495))
* upgrade bloom threshold ([de7175b](https://github.com/pex-gl/pex-shaders/commit/de7175bc081ad95fea97381dc1db1ce05a79017a))
* upgrade dof ([5fa66fe](https://github.com/pex-gl/pex-shaders/commit/5fa66fe26f9e9a4726e1645c864b7510162f1bb9))
* write normals to Z+ as default for all pipeline shaders ([5b73f77](https://github.com/pex-gl/pex-shaders/commit/5b73f77a462927de96395f5caccbae249ef6d1b0))



# [1.0.0-alpha.21](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.20...v1.0.0-alpha.21) (2024-02-06)


### Bug Fixes

* prevent empty lines from being deleted in patchES300 fragment ([6e2cd8f](https://github.com/pex-gl/pex-shaders/commit/6e2cd8fe97fbda9331e0e8f1b2e6ef6275468f45))



# [1.0.0-alpha.20](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.19...v1.0.0-alpha.20) (2023-10-26)


### Bug Fixes

* only define sheen chunk fragment if not unlit ([e702953](https://github.com/pex-gl/pex-shaders/commit/e7029531b1a1c6109e3fe0303d3e90eb6e144533))


### Features

* **main:** fix sheen roughness becoming black + approximate sheen albedo scaling ([64be03e](https://github.com/pex-gl/pex-shaders/commit/64be03e45aa7f0f9c9bd0325370a5ae7d4661e7e))
* make line width resolution independent with heuristic 1000 divide + make perspective scaling optional ([8898aaf](https://github.com/pex-gl/pex-shaders/commit/8898aaf8918e94c58d063df50fc01f48e970f945))



# [1.0.0-alpha.19](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.18...v1.0.0-alpha.19) (2023-10-25)


### Bug Fixes

* decode colors as sRGB in line, basic and helper ([455378a](https://github.com/pex-gl/pex-shaders/commit/455378aed2fd3d338c779003746649af50583592))


### Features

* add skybox exposure + optimise sky env map ([cbd6a67](https://github.com/pex-gl/pex-shaders/commit/cbd6a67c3b7c2c207060d67596bf2095ef04368b))



# [1.0.0-alpha.18](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.17...v1.0.0-alpha.18) (2023-10-20)



# [1.0.0-alpha.17](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.16...v1.0.0-alpha.17) (2023-10-20)


### Bug Fixes

* move film grain after tonemap ([9fe702c](https://github.com/pex-gl/pex-shaders/commit/9fe702c7441a77ac4bdbdfd94136a771753af1a5))
* only declare vColor if attribute is set in basic ([0daa130](https://github.com/pex-gl/pex-shaders/commit/0daa13052c48af551eb648921d2ea591745b1bd0))


### Features

* add film grain ([9a51845](https://github.com/pex-gl/pex-shaders/commit/9a518453ac97b22ba4fbc657a55dbbb7fa2668fe))
* add positionView divide for relative line width (wip) ([b59fd25](https://github.com/pex-gl/pex-shaders/commit/b59fd25a912974ad4aa0718daa6202e4d9f5266e))
* add support for vertex colors in line ([61f0073](https://github.com/pex-gl/pex-shaders/commit/61f0073585689935e593a083e75f62abc1a70c1f))



# [1.0.0-alpha.16](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.15...v1.0.0-alpha.16) (2023-10-16)


### Features

* use define for draw buffers location ([5d66dbd](https://github.com/pex-gl/pex-shaders/commit/5d66dbd23bb3184ee9dbc630ceece5e2b6f0e860))



# [1.0.0-alpha.15](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.14...v1.0.0-alpha.15) (2023-10-14)


### Bug Fixes

* add uViewportSize for depth position read in ssao ([b19b3b4](https://github.com/pex-gl/pex-shaders/commit/b19b3b410cb9bf5381d5d3789e06f8e671bf903f))


### Features

* add pipeline blit ([81eee7c](https://github.com/pex-gl/pex-shaders/commit/81eee7c627a5a9d5b934ddf72dd8d8bd9a61644c))
* add tone map, exposure and output encoding to all pipeline shaders ([ac88db5](https://github.com/pex-gl/pex-shaders/commit/ac88db513492135e162e45b410a3365d53a63b26))
* add uTexelSize to post pro + fix bloom ([912e5d3](https://github.com/pex-gl/pex-shaders/commit/912e5d34b9d62775312a740778cdaf61e9a4060b))
* parametrize PCSS ([2a613c7](https://github.com/pex-gl/pex-shaders/commit/2a613c7005ed9b88c5c4318c3564f26a2ab876ec))
* upgrade GTAO ([82f6d9e](https://github.com/pex-gl/pex-shaders/commit/82f6d9e4c9162df64ac3a9dc8664524dba7967df))



# [1.0.0-alpha.14](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.13...v1.0.0-alpha.14) (2023-10-04)


### Bug Fixes

* remove left over reference to this.GLSL3 ([e6d7496](https://github.com/pex-gl/pex-shaders/commit/e6d74965421a3e10acce5155785290c307012c0d))



# [1.0.0-alpha.13](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.12...v1.0.0-alpha.13) (2023-10-04)


### Features

* interpolate colors between segment vertices ([7d81395](https://github.com/pex-gl/pex-shaders/commit/7d81395f9ce5991caf510b69c9046e72454fb4f1))



# [1.0.0-alpha.12](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.11...v1.0.0-alpha.12) (2023-09-29)


### Bug Fixes

* clear coat attenuation for specular is not squared ([351bae4](https://github.com/pex-gl/pex-shaders/commit/351bae448a69a92b81d17c02a3e51cd909418349))
* use precision highp float for material shader ([7a3fa31](https://github.com/pex-gl/pex-shaders/commit/7a3fa316665cdf4617f8759ca0e89b8578bf873e))


### Features

* add GTAO (wip) ([1e7fc1c](https://github.com/pex-gl/pex-shaders/commit/1e7fc1c7830b68b80a041aed466b02e7d37afd3a))
* compute radius2 once in sao ([1699037](https://github.com/pex-gl/pex-shaders/commit/1699037a42717c1a99dda13f21c956136a9977d0))



# [1.0.0-alpha.11](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.10...v1.0.0-alpha.11) (2023-09-27)


### Bug Fixes

* uScreenSize redefinition + move ao into chunk ([87d14cc](https://github.com/pex-gl/pex-shaders/commit/87d14ccee885c29286dffcc6638dd786709db7b5))


### Features

* upgrade SAO ([507dc5d](https://github.com/pex-gl/pex-shaders/commit/507dc5d52685a4dbaf4337dc492c4382fbdfedf3))



# [1.0.0-alpha.10](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.9...v1.0.0-alpha.10) (2023-09-26)


### Bug Fixes

* add missing USE_FXAA_2 in main post pro pass ([34c4f82](https://github.com/pex-gl/pex-shaders/commit/34c4f82446483f1f6bd1aa0059f39617392f2dc7))


### Features

* upgrade dof ([433563b](https://github.com/pex-gl/pex-shaders/commit/433563b1a4e66c65097527b8dc41720602865363))



# [1.0.0-alpha.9](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.8...v1.0.0-alpha.9) (2023-09-25)


### Bug Fixes

* add define for clear coat and sheen using the packed texture ([a7968c2](https://github.com/pex-gl/pex-shaders/commit/a7968c2068c8a91507e43e7c08aede092e3cb8ef))
* sampleBloom crash as texture is reserved keyword ([5014a68](https://github.com/pex-gl/pex-shaders/commit/5014a680f36b7ca04174403580e85393da3a5054))


### Features

* add fxaa 3 ([cc758cc](https://github.com/pex-gl/pex-shaders/commit/cc758cc0aa2446c738800b7a0f9b383982366425))
* use define in post processing ([a576ed2](https://github.com/pex-gl/pex-shaders/commit/a576ed2473db829700ea0dd719fe8746b5220921))
* use uViewportSize instead of uPixelSize in dof ([9c5e9b2](https://github.com/pex-gl/pex-shaders/commit/9c5e9b29e404c842151d7856410901a7bac2148b))
* use vTexCoord0 instead of gl_FragCoord in threshold ([a39507a](https://github.com/pex-gl/pex-shaders/commit/a39507a4e04f415ec7d83578b89b51a24ddb6a3c))



# [1.0.0-alpha.8](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.7...v1.0.0-alpha.8) (2023-09-22)


### Bug Fixes

* support glsl < 300 for punctual shadow ([fd9a4af](https://github.com/pex-gl/pex-shaders/commit/fd9a4afa7b7293a473dc856e98058bb9c79fa5b7))


### Features

* add lut, color correction vignette + update post-processing uniforms ([ab894dc](https://github.com/pex-gl/pex-shaders/commit/ab894dc5a19af59c7be487d68822a1deb1519d4e))



# [1.0.0-alpha.7](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.6...v1.0.0-alpha.7) (2023-09-14)


### Features

* add area light disk and doubleSided support ([702beb8](https://github.com/pex-gl/pex-shaders/commit/702beb85e68fd8f237ac465419b8b8d3f90c5b31))
* add spotlight like shadows for area lights ([49eb4dc](https://github.com/pex-gl/pex-shaders/commit/49eb4dc1879d246eed3eca719bae12a1329abc63))



# [1.0.0-alpha.6](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.5...v1.0.0-alpha.6) (2023-09-13)


### Bug Fixes

* add draw buffers preprocessor to error ([7eac94e](https://github.com/pex-gl/pex-shaders/commit/7eac94ef91e08d86532ed94329c93fc086c98b04))



# [1.0.0-alpha.5](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.4...v1.0.0-alpha.5) (2023-09-12)


### Features

* move tonemapping and encoding out of sky chunk ([207c0b7](https://github.com/pex-gl/pex-shaders/commit/207c0b7a02554cfe7ddaaa4cc992edfe9fc51692))



# [1.0.0-alpha.4](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.3...v1.0.0-alpha.4) (2023-09-01)


### Features

* add PCF support to point light + fix cropped point light ([8f631d6](https://github.com/pex-gl/pex-shaders/commit/8f631d60b76dd0e2faa404ea852768538f990f32))



# [1.0.0-alpha.3](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.2...v1.0.0-alpha.3) (2023-09-01)


### Features

* rename map to texture and use _MATRIX and _TEX_COORD for texture defines ([ceef4dc](https://github.com/pex-gl/pex-shaders/commit/ceef4dcc31052e6710a499289ed6bf5fac1f67ae))



# [1.0.0-alpha.2](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2023-08-30)


### Bug Fixes

* expose basic shaders in pipeline ([9965149](https://github.com/pex-gl/pex-shaders/commit/996514965e45c9f793e54c0a7531bb43cab5744e))



# [1.0.0-alpha.1](https://github.com/pex-gl/pex-shaders/compare/v1.0.0-alpha.0...v1.0.0-alpha.1) (2023-08-30)


### Features

* add basic shaders ([349e094](https://github.com/pex-gl/pex-shaders/commit/349e09465b84b71d30d0d28a8da0945b75dc6403))



# [1.0.0-alpha.0](https://github.com/pex-gl/pex-shaders/compare/v0.1.3...v1.0.0-alpha.0) (2023-08-24)


### Features

* add parser + add output chunk + fix extension declarations for VERSION < 300 + add missing hooks ([3ffe2c7](https://github.com/pex-gl/pex-shaders/commit/3ffe2c75c6d562c66d080bb080f0edf3c37927f2))
* add segment shaders ([3aeeee6](https://github.com/pex-gl/pex-shaders/commit/3aeeee638620234530051237ca75125867da655a))
* port back changes from pex-renderer v4 ([26dfff0](https://github.com/pex-gl/pex-shaders/commit/26dfff03a507724e9a68693f0e9f79d3edce13e0))


### BREAKING CHANGES

* shaders have version check + hooks



## [0.1.3](https://github.com/pex-gl/pex-shaders/compare/v0.1.2...v0.1.3) (2022-09-01)



## [0.1.1](https://github.com/pex-gl/pex-shaders/compare/v0.1.0...v0.1.1) (2022-06-28)



# 0.1.0 (2022-06-28)

### Bug Fixes

- export default as instead of \* as ([5ebc245](https://github.com/pex-gl/pex-shaders/commit/5ebc2459f589a1f349107270480124b46d98f9c0))
- expose error shader ([d3967fa](https://github.com/pex-gl/pex-shaders/commit/d3967fa20dc00db8fd6b96f20cd214df63ab9757))
- post-processing path typos ([7f02812](https://github.com/pex-gl/pex-shaders/commit/7f02812b74658f8473d002802fb93a1998433d53))
- re-enable prefiltering loop break ([6177489](https://github.com/pex-gl/pex-shaders/commit/61774893ac4c3c7fb75df64db6aa8e74a2c2f060))

### Features

- add support for clearCoatMap and clearCoatRoughnessMap ([80153ee](https://github.com/pex-gl/pex-shaders/commit/80153ee9561b408dd92aa70410392e40c3f27488))
