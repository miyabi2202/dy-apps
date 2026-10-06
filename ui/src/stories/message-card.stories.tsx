import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_CARD_STYLE } from '../card-style';
import { MessageCard } from '../message-card';

const user = { id: 'u1', nickname: '奶茶不加糖', fansClub: { name: '弹幕墙', level: 12 } };

const meta = {
  title: 'MessageCard',
  component: MessageCard,
  args: {
    message: { id: 'm1', user, text: '主播晚上好～', ts: 0 },
    settings: DEFAULT_CARD_STYLE,
    animate: false,
    onLanded: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360, fontSize: DEFAULT_CARD_STYLE.fontSize }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Chat: Story = {};

export const Gift: Story = {
  args: {
    message: { id: 'm2', user, text: '', gift: { name: '玫瑰', count: 66, diamonds: 1 }, ts: 0 },
  },
};

/** A smaller line under the gift, like the curses it drew in 方块干预实验室. */
export const GiftWithDetail: Story = {
  args: {
    message: {
      id: 'm3',
      user,
      text: '',
      gift: { name: '嘉年华', count: 1, diamonds: 30_000 },
      detail: '触发 垃圾行×12、加速×9',
      ts: 0,
    },
  },
};

export const Likes: Story = {
  args: {
    message: { id: 'm4', user: { id: 'u2', nickname: '摸鱼大师' }, text: '', likes: 99, ts: 0 },
  },
};

export const Neon: Story = {
  args: { settings: { ...DEFAULT_CARD_STYLE, border: 'neon', perUser: false, hue: 190 } },
};

/** Plays the fly-in once. */
export const Arriving: Story = { args: { animate: true } };
