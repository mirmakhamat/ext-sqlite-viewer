'use strict';

/**
 * Webpack loader that fixes the Emscripten `module = undefined;` bug in sql-wasm.js
 * when bundled in Webpack production/CommonJS mode.
 */
module.exports = function (source) {
  return source.replace('module = undefined;', 'var module = { exports: {} };');
};
