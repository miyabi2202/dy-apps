import type { Meta, StoryObj } from '@storybook/react-vite';
import { createFakeMessage, type DanmakuMessage } from '@dy-apps/services';
import { DEFAULT_CARD_STYLE } from '../card-style';
import { MessageList } from '../message-list';

const messages: DanmakuMessage[] = Array.from({ length: 30 }, () => createFakeMessage());

const meta = {
  title: 'MessageList',
  component: MessageList,
  args: { messages, settings: DEFAULT_CARD_STYLE },
  decorators: [
    (Story) => (
      <div style={{ width: 380, height: 480, fontSize: DEFAULT_CARD_STYLE.fontSize }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bottom-anchored; scroll up to pause following and see the 新消息 button. */
export const Default: Story = {};

export const Empty: Story = { args: { messages: [] } };

/** No scrollbar, for OBS. */
export const Bare: Story = { args: { bare: true } };
