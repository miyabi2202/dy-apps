import * as stylex from '@stylexjs/stylex';

const DARK = '@media (prefers-color-scheme: dark)';

/** Light, friendly reading colours, with a dark variant that follows the system. */
export const colors = stylex.defineVars({
  bg: { default: '#f6f5f1', [DARK]: '#111318' },
  surface: { default: '#ffffff', [DARK]: '#1a1d24' },
  border: { default: '#e4e1d8', [DARK]: '#2c313c' },
  text: { default: '#1f2328', [DARK]: '#e6e8eb' },
  muted: { default: '#646b73', [DARK]: '#9aa3ad' },
  accent: { default: '#0f766e', [DARK]: '#2dd4bf' },
  /** Text on accent and done backgrounds: white on the dark light-mode accent, dark on the bright dark-mode one. */
  onAccent: { default: '#ffffff', [DARK]: '#04201c' },
  accentHover: { default: '#0d9488', [DARK]: '#5eead4' },
  accentSoft: { default: '#e6f4f2', [DARK]: 'rgba(45, 212, 191, 0.12)' },
  codeBg: { default: '#1e2430', [DARK]: '#0b0d11' },
  codeText: { default: '#e8edf5', [DARK]: '#e8edf5' },
  outputBg: { default: '#f1efe9', [DARK]: '#15181e' },
  tipBg: { default: '#eef6ff', [DARK]: 'rgba(96, 165, 250, 0.1)' },
  tipBorder: { default: '#9cc6f5', [DARK]: '#3b6ea8' },
  warnBg: { default: '#fff7e6', [DARK]: 'rgba(251, 191, 36, 0.1)' },
  warnBorder: { default: '#f3c46b', [DARK]: '#a17a24' },
  badBg: { default: '#fdeeee', [DARK]: 'rgba(248, 113, 113, 0.1)' },
  badBorder: { default: '#ef9a9a', [DARK]: '#a14646' },
  done: { default: '#16a34a', [DARK]: '#4ade80' },
});
