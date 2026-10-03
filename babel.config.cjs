// Used by webpack (babel-loader) and Jest (babel-jest).
// StyleX is compiled by @stylexjs/unplugin in bundlers, so the StyleX Babel
// plugin is only needed under Jest.
module.exports = (api) => {
  const isTest = api.env('test');
  return {
    presets: [
      ['@babel/preset-env', isTest ? { targets: { node: 'current' } } : { modules: false }],
      ['@babel/preset-react', { runtime: 'automatic' }],
      '@babel/preset-typescript',
    ],
    plugins: isTest
      ? [
          [
            '@stylexjs/babel-plugin',
            {
              dev: true,
              test: true,
              runtimeInjection: false,
              unstable_moduleResolution: { type: 'commonJS' },
            },
          ],
        ]
      : [],
  };
};
