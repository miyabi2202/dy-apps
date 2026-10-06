import * as stylex from '@stylexjs/stylex';
import {
  addMessage,
  createDemoStores,
  createFakeMessage,
  fakeMessageAt,
  liveRoomFrom,
  readDemoInterval,
  readDemoRandom,
  readLiveRoom,
  setDemoParams,
  setLiveRoomParams,
  type Connection,
  type DanmakuMessage,
} from '@dy-apps/services';
import {
  Button,
  cardStyleToParams,
  Column,
  DEFAULT_CARD_STYLE,
  fontFamily,
  MessageList,
  Page,
  SourcePanel,
  text,
  useDemo,
} from '@dy-apps/ui';
import { colors, radius, space } from '@dy-apps/ui/tokens.stylex';
import { useCallback, useEffect, useState } from 'react';
import type { DanmakuConfig } from './config';
import { connectionStore } from './dyhub';
import { loadSettings, saveSettings } from './settings';
import { Controls } from './ui/controls';
import { useDyhub, type CreateDyhubClient } from './use-dyhub';

/** Older messages are dropped past this, so a long stream doesn't grow memory forever. */
const MAX_MESSAGES = 1000;
const demoStores = createDemoStores('danmaku', { source: 'fake', intervalMs: 900 });

interface PageOptions {
  /** `?obs=1`: overlay only, no editor chrome, transparent background. */
  obs: boolean;
  /** `?demo=<ms>` or `?port=…&room=…`: start the demo straight away (useful in an OBS source). */
  autoDemo: boolean;
  /** From the URL where it says, otherwise what was saved last time. */
  config: DanmakuConfig;
}

function optionsFromUrl(): PageOptions {
  const q = new URLSearchParams(window.location.search);
  const demo = readDemoInterval(window.location.search);
  // `?port=…&room=…`: demo with real chat from this live room.
  const liveRoom = readLiveRoom(window.location.search);
  return {
    obs: q.get('obs') === '1',
    autoDemo: demo !== null || liveRoom !== null,
    config: {
      ...(liveRoom
        ? { port: String(liveRoom.port), roomId: liveRoom.roomId }
        : connectionStore.read()),
      style: loadSettings(window.location.search),
      demo: {
        source: liveRoom ? 'live' : demo !== null ? 'fake' : demoStores.source.read(),
        intervalMs: demo ?? demoStores.intervalMs.read(),
        random: readDemoRandom(window.location.search),
      },
    },
  };
}

interface Props {
  /** Swapped for a fake in tests. */
  createClient?: CreateDyhubClient;
}

/** The 弹幕墙 route: an editor with live preview, or (`?obs=1`) the bare overlay for OBS. */
export function DanmakuPage({ createClient }: Props) {
  const [initial] = useState(optionsFromUrl);
  const { config } = initial;
  const [settings, setSettings] = useState(config.style);
  const [messages, setMessages] = useState<readonly DanmakuMessage[]>([]);
  const [demoRunning, setDemoRunning] = useState(initial.autoDemo);
  const [demoSource, setDemoSource] = useState(config.demo.source);
  const [demoIntervalMs, setDemoIntervalMs] = useState(config.demo.intervalMs);
  const [connection, setConnection] = useState<Connection>({
    port: config.port,
    roomId: config.roomId,
  });
  const liveRoom = liveRoomFrom(connection);

  const push = useCallback((message: DanmakuMessage) => {
    setMessages((prev) => addMessage(prev, message, MAX_MESSAGES));
  }, []);

  // `?random=0`: the fake list in order at a fixed interval, so every run looks the same.
  const demoRandom = config.demo.random !== false;
  const pushFake = useCallback(
    (n: number) => push(demoRandom ? createFakeMessage() : fakeMessageAt(n)),
    [push, demoRandom],
  );
  useDemo(
    demoRunning && demoSource === 'fake',
    demoIntervalMs,
    pushFake,
    demoRandom ? Math.random : null,
  );
  const dyhub = useDyhub(
    demoRunning && demoSource === 'live' ? liveRoom : null,
    push,
    createClient,
  );
  const canStartDemo = demoSource === 'fake' || liveRoom !== null;

  // Only the editor saves: an OBS source opened from a link mustn't overwrite the editor's config.
  useEffect(() => {
    if (initial.obs) return;
    saveSettings(settings);
    demoStores.source.write(demoSource);
    demoStores.intervalMs.write(demoIntervalMs);
    connectionStore.write(connection);
  }, [initial.obs, settings, demoSource, demoIntervalMs, connection]);

  const font = styles.font(fontFamily(settings), settings.fontSize);
  const list = <MessageList messages={messages} settings={settings} bare={initial.obs} />;

  if (initial.obs) {
    return <div {...stylex.props(styles.obs, font)}>{list}</div>;
  }

  const obsParams = cardStyleToParams(settings);
  obsParams.set('obs', '1');
  if (demoRunning && demoSource === 'fake') setDemoParams(obsParams, demoIntervalMs, demoRandom);
  if (demoRunning && demoSource === 'live' && liveRoom) setLiveRoomParams(obsParams, liveRoom);
  const obsUrl = `${window.location.origin}${window.location.pathname}?${obsParams.toString()}`;

  return (
    <Page
      xstyle={styles.editor}
      title="弹幕墙"
      actions={<Button onClick={() => setSettings(DEFAULT_CARD_STYLE)}>恢复默认样式</Button>}
    >
      <Column gap="lg">
        <Controls
          settings={settings}
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          obsUrl={obsUrl}
          demo={
            <SourcePanel
              running={demoRunning}
              onToggle={() => setDemoRunning((r) => !r)}
              canStart={canStartDemo}
              source={demoSource}
              onSourceChange={setDemoSource}
              intervalMs={demoIntervalMs}
              onIntervalChange={setDemoIntervalMs}
              connection={connection}
              onConnectionChange={setConnection}
              liveState={dyhub}
            >
              <Button onClick={() => setMessages([])}>清空</Button>
              <span {...stylex.props(text.muted)}>{messages.length} 条</span>
            </SourcePanel>
          }
        />
        <p {...stylex.props(text.muted, styles.stageHint)}>
          预览 · 棋盘格为透明区域 · 拖动右下角调整大小
        </p>
        <div {...stylex.props(styles.stage)}>
          <div {...stylex.props(styles.fill, font)}>{list}</div>
        </div>
      </Column>
    </Page>
  );
}

const styles = stylex.create({
  font: (family: string, size: number) => ({
    fontFamily: family,
    fontSize: size,
  }),
  // Fills the OBS browser source. No background, so the stream shows through.
  obs: {
    inset: 0,
    paddingBlock: space.md,
    position: 'fixed',
  },
  editor: {
    padding: space.xl,
  },
  stageHint: {
    margin: 0,
  },
  // Checkerboard marks the transparent area, like an image editor.
  stage: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    overflow: 'hidden',
    backgroundImage: `repeating-conic-gradient(${colors.panelRaised} 0 25%, ${colors.panel} 0 50%)`,
    backgroundSize: '24px 24px',
    resize: 'both',
    height: 560,
    maxWidth: '100%',
    minHeight: 160,
    minWidth: 220,
    width: 420,
  },
  fill: {
    height: '100%',
  },
});
