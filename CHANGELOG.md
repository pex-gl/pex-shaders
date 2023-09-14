# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

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
