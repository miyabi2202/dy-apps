import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stylex from '@stylexjs/unplugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {(env: unknown, argv: { mode?: string }) => import('webpack').Configuration} */
export default (_env, argv) => {
  const isProd = argv.mode === 'production';
  return {
    entry: './src/main.tsx',
    output: {
      path: path.resolve(dirname, 'dist-webpack'),
      filename: isProd ? '[name].[contenthash].js' : '[name].js',
      clean: true,
    },
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'] },
    module: {
      rules: [
        { test: /\.[jt]sx?$/, exclude: /node_modules/, use: 'babel-loader' },
        { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] },
      ],
    },
    plugins: [
      stylex.webpack({ dev: !isProd, useCSSLayers: true }),
      new MiniCssExtractPlugin({ filename: isProd ? '[name].[contenthash].css' : '[name].css' }),
      new HtmlWebpackPlugin({
        templateContent: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tetris</title>
  </head>
  <body><div id="root"></div></body>
</html>`,
      }),
    ],
    devServer: { port: 8080, hot: true, historyApiFallback: true },
  };
};
