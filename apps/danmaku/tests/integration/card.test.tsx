import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';
import type { DanmakuMessage, DanmakuUser } from '../../src/types';
import { MessageCard } from '../../src/ui/message-card';

const message: DanmakuMessage = {
  id: 'm1',
  user: { id: 'u1', nickname: '摸鱼大师' },
  text: '666666',
  ts: 0,
};

function renderCard(
  settings: Partial<Settings> = {},
  onLanded = jest.fn(),
  fansClub?: DanmakuUser['fansClub'],
) {
  const view = render(
    <MessageCard
      message={{ ...message, user: { ...message.user, fansClub } }}
      settings={{ ...DEFAULT_SETTINGS, ...settings }}
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

  it('shows no fan-club badge for non-members', () => {
    renderCard();
    expect(screen.queryByTestId('fans-club-level')).not.toBeInTheDocument();
  });

  it('shows the avatar image when there is one, and falls back to the initial if it fails', () => {
    const { container } = render(
      <MessageCard
        message={{ ...message, user: { ...message.user, avatarUrl: 'https://example.com/a.png' } }}
        settings={DEFAULT_SETTINGS}
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
