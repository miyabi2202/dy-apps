import { liveRoomFrom } from '@dy-apps/services';
import { colors, fonts, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect } from 'react';
import type { GameEngine } from '../core/game';
import { newGame, type GiftFeed } from '../gift-feed';
import type { KeyboardController } from '../input/keyboard';
import type { TetrisConfig } from '../config';
import { useGiftSource } from '../use-gift-source';
import type { CreateDyhubClient } from '../use-live-gifts';
import { CenterPanel } from './center-panel';
import { GameLayout } from './game-layout';
import { TeamPanel } from './team-panel';
import { usePlay } from './use-engine';

interface Props {
  engine: GameEngine;
  feed: GiftFeed;
  keyboard: KeyboardController;
  /** From the OBS link: fake gifts, or the live room's. */
  config: TetrisConfig;
  createClient?: CreateDyhubClient;
}

/**
 * The OBS page: what viewers see. The board, the pending curses and each gift as a card,
 * on a transparent background, with fake or live gifts as the link says. Played with the keyboard
 * through OBS's 交互 window.
 */
export function ObsView({ engine, feed, keyboard, config, createClient }: Props) {
  const boardRef = usePlay(engine, keyboard);
  useGiftSource({
    demo: config.demo,
    room: liveRoomFrom(config),
    running: true,
    feed,
    createClient,
  });

  useEffect(() => {
    document.title = '方块干预实验室 · OBS';
  }, []);

  return (
    <div {...stylex.props(styles.root)}>
      <GameLayout
        board={
          <CenterPanel
            engine={engine}
            boardRef={boardRef}
            onRestart={() => newGame(engine, feed)}
            viewer
          />
        }
        side={<TeamPanel engine={engine} feed={feed} />}
      />
    </div>
  );
}

// No background, so the stream shows through around the panels.
const styles = stylex.create({
  root: {
    padding: space.lg,
    color: colors.text,
    colorScheme: 'dark',
    fontFamily: fonts.body,
  },
});
