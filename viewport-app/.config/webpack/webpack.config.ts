import path from 'path';
import type { Configuration } from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const config = (env: Record<string, unknown>): Configuration => {
  const isProduction = env.production === true;

  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    entry: {
      // App plugin (config page + backend registration)
      module: path.resolve(__dirname, '../../src/module.tsx'),
      // Nested panel plugin, emitted to dist/panel/module.js
      'panel/module': path.resolve(__dirname, '../../src/panel/module.ts'),
    },
    output: {
      path: path.resolve(__dirname, '../../dist'),
      filename: '[name].js',
      library: {
        type: 'amd',
      },
      publicPath: '/',
      clean: true,
    },
    // react/jsx-runtime must be external: bundling the local React 18 copy of
    // the jsx runtime crashes against the React 19 instance Grafana provides.
    externals: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@grafana/data',
      '@grafana/ui',
      '@grafana/runtime',
      '@emotion/css',
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: 'automatic',
                  },
                },
              },
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: path.resolve(__dirname, '../../src/plugin.json'), to: '.' },
          { from: path.resolve(__dirname, '../../src/panel/plugin.json'), to: 'panel/' },
          { from: path.resolve(__dirname, '../../src/img/logo.svg'), to: 'panel/img/logo.svg', toType: 'file' },
          { from: path.resolve(__dirname, '../../src/img/**'), to: 'img/[name][ext]' },
          { from: path.resolve(__dirname, '../../README.md'), to: '.' },
          { from: path.resolve(__dirname, '../../CHANGELOG.md'), to: '.' },
          { from: path.resolve(__dirname, '../../LICENSE'), to: 'LICENSE', toType: 'file' },
        ],
      }),
    ],
  };
};

export default config;
