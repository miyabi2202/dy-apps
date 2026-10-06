import { fireEvent, render, screen } from '@testing-library/react';
import type { DanmakuMessage, DanmakuUser } from '@dy-apps/services';
import { DEFAULT_CARD_STYLE, type CardStyle } from '../src/card-style';
import { MessageCard } from '../src/message-card';

const message: DanmakuMessage = {
  id: 'm1',
  user: { id: 'u1', nickname: '摸鱼大师' },
  text: '666666',
  ts: 0,
};

function renderCard(
  settings: Partial<CardStyle> = {},
  onLanded = jest.fn(),
  fansClub?: DanmakuUser['fansClub'],
) {
  const view = render(
    <MessageCard
      message={{ ...message, user: { ...message.user, fansClub } }}
      settings={{ ...DEFAULT_CARD_STYLE, ...settings }}
      animate
      onLanded={onLanded}
    />,
  );
  return { ...view, card: view.container.querySelector('article')!, onLanded };
}

describe('MessageCard', () => {
  it('shows the avatar initial and name, then the message', () => {
    const { card } = renderCard();
    expect(card).toHaveTextContent(/^摸摸鱼大师666666$/);
    expect(screen.getByText('666666').tagName).toBe('P');
  });

  it('shows the fan-club level between the name and the message', () => {
    const { card } = renderCard({}, jest.fn(), { name: '甄选', level: 12 });
    const badge = screen.getByTestId('fans-club-level');
    expect(badge).toHaveTextContent('♥12');
    expect(badge).toHaveAttribute('title', '甄选 粉丝团 12 级');
    expect(card).toHaveTextContent(/^摸摸鱼大师♥12666666$/);
  });

  it('shows the avatar image when there is one, and falls back to the initial if it fails', () => {
    const { container } = render(
      <MessageCard
        message={{ ...message, user: { ...message.user, avatarUrl: 'https://example.com/a.png' } }}
        settings={DEFAULT_CARD_STYLE}
        animate={false}
        onLanded={() => {}}
      />,
    );
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'https://example.com/a.png');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('article')).toHaveTextContent(/^摸摸鱼大师/);
  });

  it.each([
    ['aurora', 1],
    ['gradient', 1],
    ['neon', 0],
    ['ribbon', 0],
    ['dashed', 0],
    ['none', 0],
  ] as const)('draws a separate gradient ring only where needed: %s', (border, rings) => {
    const { card } = renderCard({ border });
    expect(card.querySelectorAll(':scope > span[aria-hidden]')).toHaveLength(rings);
  });

  it('reports landing when its own fly-in ends, not a child animation', () => {
    const { card, onLanded } = renderCard({ border: 'aurora' });
    fireEvent.animationEnd(card.querySelector('span[aria-hidden]')!);
    expect(onLanded).not.toHaveBeenCalled();
    fireEvent.animationEnd(card);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
});

describe('MessageCard with a gift', () => {
  const renderGift = (gift: DanmakuMessage['gift']) =>
    render(
      <MessageCard
        message={{ ...message, text: '', gift }}
        settings={DEFAULT_CARD_STYLE}
        animate={false}
        onLanded={jest.fn()}
      />,
    );

  it('shows the gift, its count and the total diamonds for that count', () => {
    renderGift({ name: '嘉年华', count: 3, diamonds: 30000 });
    expect(screen.getByTestId('gift')).toHaveTextContent('送出🎁嘉年华×3（90,000钻）');
    expect(screen.queryByText('666666')).not.toBeInTheDocument();
  });

  it('leaves the diamonds out when the price is unknown or 0', () => {
    const { rerender } = renderGift({ name: '玫瑰', count: 2 });
    expect(screen.queryByTestId('gift-diamonds')).not.toBeInTheDocument();
    rerender(
      <MessageCard
        message={{ ...message, text: '', gift: { name: '玫瑰', count: 2, diamonds: 0 } }}
        settings={DEFAULT_CARD_STYLE}
        animate={false}
        onLanded={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('gift-diamonds')).not.toBeInTheDocument();
  });

  it("shows the gift's icon, or 🎁 if it fails to load", () => {
    const { container } = renderGift({ name: '玫瑰', count: 1, iconUrl: 'https://x/rose.png' });
    const icon = container.querySelector('img[src="https://x/rose.png"]')!;
    expect(icon).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByTestId('gift')).not.toHaveTextContent('🎁');
    fireEvent.error(icon);
    expect(screen.getByTestId('gift')).toHaveTextContent('🎁');
  });
});

describe('MessageCard with likes', () => {
  it('shows the run of likes instead of a message', () => {
    render(
      <MessageCard
        message={{ ...message, text: '', likes: 37 }}
        settings={DEFAULT_CARD_STYLE}
        animate={false}
        onLanded={jest.fn()}
      />,
    );
    expect(screen.getByTestId('likes')).toHaveTextContent('点赞❤️×37');
    expect(screen.queryByText('666666')).not.toBeInTheDocument();
  });
});
