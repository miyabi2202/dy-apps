import type { Meta, StoryObj } from '@storybook/react-vite';
import { ObsLink } from '../obs-link';

const meta = {
  title: 'ObsLink',
  component: ObsLink,
  args: {
    url: 'https://dy-apps.example/danmaku?obs=1&border=aurora&size=16',
    children: '在 OBS 中添加「浏览器」来源并粘贴此链接，背景透明。',
  },
} satisfies Meta<typeof ObsLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
