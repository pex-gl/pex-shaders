module.exports = {
  chunks: require('./shaders/chunks/index.js'),
  pipeline: require('./shaders/pipeline/index.js'),
  // postProcessing: require('shaders/post-rocessing'),
  reflectionProbe: require('./shaders/reflection-probe/index.js'),
  skybox: require('./shaders/skybox/index.js')
}