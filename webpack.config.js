//@ts-check

'use strict';

const path = require('path');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode',
    'node:sqlite': 'commonjs node:sqlite'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /sql-wasm\.js$/,
        use: [
          {
            loader: path.resolve(__dirname, 'webpack-sql-wasm-loader.js')
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
  plugins: [
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('CopyWasmPlugin', () => {
          const fs = require('fs');
          const wasmSrc = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
          const wasmDest = path.resolve(__dirname, 'dist/sql-wasm.wasm');
          if (fs.existsSync(wasmSrc)) {
            fs.copyFileSync(wasmSrc, wasmDest);
          }
        });
      }
    }
  ]
};
module.exports = [ extensionConfig ];