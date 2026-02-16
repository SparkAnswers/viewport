import path from 'path';
import type { Configuration } from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const config = (env: Record<string, unknown>): Configuration => {
  const isProduction = env.production === true;

  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    entry: {
      module: path.resolve(__dirname, '../../src/module.ts'),
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
    externals: [
      'react',
      'react-dom',
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
          { from: path.resolve(__dirname, '../../src/img/**'), to: 'img/[name][ext]' },
          { from: path.resolve(__dirname, '../../README.md'), to: '.' },
        ],
      }),
    ],
  };
};

export default config;
