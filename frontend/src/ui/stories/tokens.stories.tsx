import type { Meta, StoryObj } from '@storybook/react-vite';
import * as stylex from '@stylexjs/stylex';
import { Column, Grid, Row } from '../layout';
import { text } from '../text';
import { colors, fontSize, radius, space } from '../tokens.stylex';

const COLOR_NAMES = [
  'bg',
  'panel',
  'panelRaised',
  'border',
  'text',
  'muted',
  'accent',
  'accentHover',
  'accentSoft',
  'onAccent',
  'warn',
  'warnSoft',
  'danger',
  'dangerHover',
  'dangerSoft',
  'success',
] as const;
const SPACE_NAMES = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const;
const RADIUS_NAMES = ['sm', 'md', 'lg', 'pill'] as const;
const FONT_SIZE_NAMES = ['xs', 'sm', 'md', 'lg'] as const;

const styles = stylex.create({
  swatch: (color: string) => ({
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 1,
    backgroundColor: color,
    height: 48,
  }),
  bar: (width: string) => ({
    backgroundColor: colors.accent,
    height: 12,
    width,
  }),
  corner: (r: string) => ({
    borderColor: colors.accent,
    borderRadius: r,
    borderStyle: 'solid',
    borderWidth: 2,
    height: 48,
    width: 96,
  }),
  sample: (size: string) => ({ fontSize: size }),
  name: { width: 48 },
});

function Tokens() {
  return (
    <Column gap="xxl">
      <Column gap="md">
        <h2 {...stylex.props(text.caption)}>colors</h2>
        <Grid min={120}>
          {COLOR_NAMES.map((name) => (
            <Column key={name} gap="xs">
              <div {...stylex.props(styles.swatch(colors[name]))} />
              <span {...stylex.props(text.muted)}>{name}</span>
            </Column>
          ))}
        </Grid>
      </Column>
      <Column gap="md">
        <h2 {...stylex.props(text.caption)}>space</h2>
        {SPACE_NAMES.map((name) => (
          <Row key={name}>
            <span {...stylex.props(text.muted, styles.name)}>{name}</span>
            <div {...stylex.props(styles.bar(space[name]))} />
          </Row>
        ))}
      </Column>
      <Column gap="md">
        <h2 {...stylex.props(text.caption)}>radius</h2>
        <Row gap="xl">
          {RADIUS_NAMES.map((name) => (
            <Column key={name} gap="xs" align="center">
              <div {...stylex.props(styles.corner(radius[name]))} />
              <span {...stylex.props(text.muted)}>{name}</span>
            </Column>
          ))}
        </Row>
      </Column>
      <Column gap="md">
        <h2 {...stylex.props(text.caption)}>fontSize</h2>
        {FONT_SIZE_NAMES.map((name) => (
          <Row key={name} align="baseline">
            <span {...stylex.props(text.muted, styles.name)}>{name}</span>
            <span {...stylex.props(styles.sample(fontSize[name]))}>方块干预实验室 Aa 123</span>
          </Row>
        ))}
      </Column>
    </Column>
  );
}

const meta = {
  title: 'Tokens',
  component: Tokens,
} satisfies Meta<typeof Tokens>;

export default meta;

export const All: StoryObj<typeof meta> = {};
