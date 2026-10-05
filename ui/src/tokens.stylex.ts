import * as stylex from '@stylexjs/stylex';

/**
 * The one palette every app uses (dark). Import tokens straight from
 * `@dy-apps/ui/tokens.stylex`, not through the package index: StyleX resolves
 * variables by the file that defines them.
 */
export const colors = stylex.defineVars({
  /** Page background. */
  bg: '#0a0f1c',
  /** Panels and cards. */
  panel: '#111827',
  /** Controls and wells inside a panel. */
  panelRaised: '#172033',
  border: '#24304a',
  text: '#e5e7eb',
  muted: '#94a3b8',
  accent: '#38bdf8',
  accentHover: '#7dd3fc',
  accentSoft: 'rgba(56, 189, 248, 0.12)',
  /** Text on accent, warn, danger and success fills. */
  onAccent: '#0a0f1c',
  warn: '#fbbf24',
  warnSoft: 'rgba(251, 191, 36, 0.12)',
  danger: '#f87171',
  dangerHover: '#fca5a5',
  dangerSoft: 'rgba(248, 113, 113, 0.12)',
  success: '#4ade80',
});

/** Spacing scale for gaps and padding. */
export const space = stylex.defineVars({
  xxs: '2px',
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  xxl: '24px',
});

export const radius = stylex.defineVars({
  sm: '6px',
  md: '8px',
  lg: '12px',
  pill: '999px',
});

export const fontSize = stylex.defineVars({
  xs: '12px',
  sm: '13px',
  md: '14px',
  lg: '16px',
});

export const fonts = stylex.defineVars({
  body: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, 'SFMono-Regular', Menlo, monospace",
});
