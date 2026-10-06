// Jest stand-in for @stylexjs/stylex. StyleX needs a compile step that only Vite
// runs, so tests use pass-through styles and empty class names.
module.exports = {
  create: (styles) => styles,
  props: () => ({ className: undefined }),
  keyframes: () => 'keyframes',
  defineVars: (vars) => vars,
};
