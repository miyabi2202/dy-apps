import * as stylex from '@stylexjs/stylex';
import { colors } from './tokens.stylex';

/** Styles shared by several panels. */
export const ui = stylex.create({
  panel: {
    padding: 14,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: 12,
    backgroundColor: colors.panel,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  subTitle: {
    margin: 0,
    color: colors.muted,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
  },
  button: {
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingBlock: 6,
    paddingInline: 10,
    backgroundColor: {
      default: colors.panelRaised,
      ':disabled': colors.panel,
      ':hover': colors.border,
    },
    color: {
      default: colors.text,
      ':disabled': colors.muted,
    },
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
    fontSize: 14,
    outlineColor: colors.accent,
    outlineOffset: 2,
    minHeight: 36,
  },
  primary: {
    borderColor: colors.accent,
    backgroundColor: {
      default: colors.accent,
      ':hover': '#7dd3fc',
    },
    color: '#0a0f1c',
    fontWeight: 700,
  },
  input: {
    borderColor: colors.border,
    borderRadius: 6,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingInline: 8,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 14,
    minHeight: 34,
    minWidth: 0,
    width: '100%',
  },
  statGrid: {
    margin: 0,
    gap: 6,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
  },
  stat: {
    borderRadius: 6,
    paddingBlock: 4,
    paddingInline: 8,
    backgroundColor: colors.panelRaised,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  statValue: {
    margin: 0,
    fontSize: 16,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
});
