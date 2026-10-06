import type { Meta, StoryObj } from '@storybook/react-vite';
import * as stylex from '@stylexjs/stylex';
import { Column, Grid, Row } from '../layout';
import { colors, radius, space } from '../tokens.stylex';

const styles = stylex.create({
  box: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
});

const boxes = ['一', '二', '三', '四', '五'].map((label) => (
  <div key={label} {...stylex.props(styles.box)}>
    {label}
  </div>
));

const spaces = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const;

const meta = {
  title: 'Layout',
  component: Row,
  args: { gap: 'md', children: boxes },
  argTypes: {
    gap: { control: 'select', options: spaces },
    align: { control: 'select', options: ['start', 'center', 'end', 'stretch', 'baseline'] },
    justify: { control: 'select', options: ['start', 'center', 'end', 'between'] },
  },
} satisfies Meta<typeof Row>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RowStory: Story = { name: 'Row' };

export const ColumnStory: Story = {
  name: 'Column',
  render: (args) => <Column {...args} />,
};

export const GridFixed: Story = {
  name: 'Grid (3 columns)',
  render: ({ gap }) => (
    <Grid gap={gap} columns={3}>
      {boxes}
    </Grid>
  ),
};

export const GridFit: Story = {
  name: 'Grid (fit 160px)',
  render: ({ gap }) => (
    <Grid gap={gap} min={160}>
      {boxes}
    </Grid>
  ),
};
