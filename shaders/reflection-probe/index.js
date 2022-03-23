module.exports = {
    'blitToOctMapAtlas': { frag: require('./blit-to-oct-map-atlas.frag.js') },
    'convolveOctMapAtlasToOctMap': { frag: require('./convolve-oct-map-atlas-to-oct-map.frag.js') },
    'cubemapToOctMap': { frag: require('./cubemap-to-octmap.frag.js') },
    'downsampleFromOctMapAtlas': { frag: require('./downsample-from-oct-map-atlas.frag.js') },
    'fullscreenQuad': { vert: require('./fullscreen-quad.vert.js') },
    'prefilterFromOctMapAtlas': { frag: require('./prefilter-from-oct-map-atlas.frag.js') }
}