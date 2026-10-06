import {
  liveRoomFrom,
  type Connection,
  type DanmakuMessage,
  type DemoSource,
} from '@dy-apps/services';
import { Column, Grid, ObsLink, Page, Panel, Slider, SourcePanel } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { configToParams, DEMO_INTERVAL, saveConfig, type TetrisConfig } from '../config';
import { CONFIG } from '../core/config';
import type { GameEngine } from '../core/game';
import { newGame, type GiftFeed } from '../gift-feed';
import type { KeyboardController } from '../input/keyboard';
import { useGiftSource } from '../use-gift-source';
import type { CreateDyhubClient } from '../use-live-gifts';
import { CenterPanel } from './center-panel';
import { GameLayout } from './game-layout';
import { LogPanel } from './log-panel';
import { TeamPanel } from './team-panel';
import { usePlay } from './use-engine';

interface Props {
  engine: GameEngine;
  feed: GiftFeed;
  keyboard: KeyboardController;
  /** Where gifts come from at first; the trigger chance comes from the engine. */
  config: TetrisConfig;
  /** Swapped for fakes in tests. */
  createClient?: CreateDyhubClient;
  fakeGift?: () => DanmakuMessage;
}

/**
 * The config page: the game settings, where gifts come from and the OBS link, above the
 * full game as a preview. Gifts are fake ones by default, or a live room's.
 */
export function App({ engine, feed, keyboard, config: initial, createClient, fakeGift }: Props) {
  const boardRef = usePlay(engine, keyboard);
  const [connection, setConnection] = useState<Connection>({
    port: initial.port,
    roomId: initial.roomId,
  });
  const [source, setSource] = useState<DemoSource>(initial.demo.source);
  const [intervalMs, setIntervalMs] = useState(initial.demo.intervalMs);
  const [sending, setSending] = useState(false);
  const room = liveRoomFrom(connection);
  const { probability } = engine;
  const config: TetrisConfig = { ...connection, probability, demo: { source, intervalMs } };
  const liveState = useGiftSource({
    demo: config.demo,
    room,
    running: sending,
    feed,
    fakeGift,
    createClient,
  });

  useEffect(
    () => saveConfig({ ...connection, probability, demo: { source, intervalMs } }),
    [connection, probability, source, intervalMs],
  );

  const obsParams = configToParams(config);
  obsParams.set('obs', '1');
  const obsUrl = `${window.location.origin}${window.location.pathname}?${obsParams.toString()}`;

  return (
    <Page title="方块干预实验室" xstyle={styles.page}>
      <Column gap="lg">
        <Grid min={320} gap="lg">
          <Panel title="游戏" gap="md">
            <Slider
              label="礼物触发概率"
              hint="每 1 钻有多少概率触发一个随机诅咒"
              value={Math.round(engine.probability * 100)}
              min={CONFIG.gifts.probabilityRange[0] * 100}
              max={CONFIG.gifts.probabilityRange[1] * 100}
              unit="%"
              onChange={(pct) => engine.setProbability(pct / 100)}
            />
          </Panel>
          <SourcePanel
            running={sending}
            onToggle={() => setSending((on) => !on)}
            canStart={source === 'fake' || room !== null}
            source={source}
            onSourceChange={setSource}
            intervalMs={intervalMs}
            onIntervalChange={setIntervalMs}
            interval={DEMO_INTERVAL}
            connection={connection}
            onConnectionChange={setConnection}
            liveState={liveState}
            fakeLabels={{ start: '开始模拟送礼', stop: '停止模拟送礼' }}
          />
          <Panel title="OBS" gap="md">
            <ObsLink url={obsUrl}>
              在 OBS
              中添加「浏览器」来源并粘贴此链接，背景透明，观众看到棋盘、待执行诅咒和送礼记录。
              {source === 'fake'
                ? '来源会播放同样的模拟送礼。'
                : room
                  ? '来源会连接上面的直播间。'
                  : '填好直播间后链接会带上它。'}
              在 OBS 里右键来源选「交互」即可用键盘游玩。
            </ObsLink>
          </Panel>
        </Grid>

        <GameLayout
          board={
            <CenterPanel
              engine={engine}
              boardRef={boardRef}
              onRestart={() => newGame(engine, feed)}
            />
          }
          side={<TeamPanel engine={engine} feed={feed} />}
        />

        <LogPanel engine={engine} />
      </Column>
    </Page>
  );
}

const styles = stylex.create({
  page: {
    padding: space.xl,
    marginInline: 'auto',
    maxWidth: 1440,
  },
});
