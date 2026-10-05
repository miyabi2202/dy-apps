import * as stylex from '@stylexjs/stylex';
import {
  createStore,
  liveRoomFrom,
  readLiveRoom,
  setLiveRoomParams,
  type LiveRoom,
} from '@dy-apps/services';
import { Button, Column, Page, text } from '@dy-apps/ui';
import { colors, radius, space } from '@dy-apps/ui/tokens.stylex';
import { useCallback, useEffect, useState } from 'react';
import { createFakeMessage } from './demo';
import { connectionStore } from './dyhub';
import {
  DEFAULT_SETTINGS,
  fontFamily,
  loadSettings,
  saveSettings,
  settingsToParams,
  type Settings,
} from './settings';
import { addMessage, type DanmakuMessage } from './types';
import { Controls } from './ui/controls';
import { DEMO_INTERVAL_RANGE, DEMO_SOURCES, DemoPanel, type DemoSource } from './ui/demo-panel';
import { MessageList } from './ui/message-list';
import { useDyhub, type ConnectDyhub } from './use-dyhub';

/** Older messages are dropped past this, so a long stream doesn't grow memory forever. */
const MAX_MESSAGES = 1000;
const DEFAULT_DEMO_INTERVAL_MS = 900;

const demoIntervalStore = createStore('danmaku.demoIntervalMs', {
  fallback: DEFAULT_DEMO_INTERVAL_MS,
  parse: (raw) => (typeof raw === 'number' ? clampDemoInterval(raw) : undefined),
});

const demoSourceStore = createStore<DemoSource>('danmaku.demoSource', {
  fallback: 'fake',
  parse: (raw) => DEMO_SOURCES.find((s) => s === raw),
});

function clampDemoInterval(ms: number): number | undefined {
  const [min, max] = DEMO_INTERVAL_RANGE;
  return Number.isFinite(ms) ? Math.min(max, Math.max(min, ms)) : undefined;
}

interface PageOptions {
  /** `?obs=1`: overlay only, no editor chrome, transparent background. */
  obs: boolean;
  settings: Settings;
  /** `?demo=<ms>` or `?port=…&room=…`: start the demo straight away (useful in an OBS source). */
  autoDemo: boolean;
  demoSource: DemoSource;
  demoIntervalMs: number;
  /** `?port=…&room=…`: demo with real chat from this live room. */
  liveRoom: LiveRoom | null;
}

function optionsFromUrl(): PageOptions {
  const q = new URLSearchParams(window.location.search);
  const demo = q.get('demo');
  const liveRoom = readLiveRoom(window.location.search);
  return {
    obs: q.get('obs') === '1',
    settings: loadSettings(window.location.search),
    autoDemo: demo !== null || liveRoom !== null,
    demoSource: liveRoom ? 'live' : demo !== null ? 'fake' : demoSourceStore.read(),
    demoIntervalMs: (demo && clampDemoInterval(Number(demo))) || demoIntervalStore.read(),
    liveRoom,
  };
}

interface Props {
  /** Swapped for a fake in tests. */
  connect?: ConnectDyhub;
}

/** The 弹幕墙 route: an editor with live preview, or (`?obs=1`) the bare overlay for OBS. */
export function DanmakuPage({ connect }: Props) {
  const [initial] = useState(optionsFromUrl);
  const [settings, setSettings] = useState(initial.settings);
  const [messages, setMessages] = useState<readonly DanmakuMessage[]>([]);
  const [demoRunning, setDemoRunning] = useState(initial.autoDemo);
  const [demoSource, setDemoSource] = useState(initial.demoSource);
  const [demoIntervalMs, setDemoIntervalMs] = useState(initial.demoIntervalMs);
  const [connection, setConnection] = useState(() =>
    initial.liveRoom
      ? { port: String(initial.liveRoom.port), roomId: initial.liveRoom.roomId }
      : connectionStore.read(),
  );
  const liveRoom = liveRoomFrom(connection);

  const push = useCallback((message: DanmakuMessage) => {
    setMessages((prev) => addMessage(prev, message, MAX_MESSAGES));
  }, []);

  useDemo(demoRunning && demoSource === 'fake', demoIntervalMs, push);
  const dyhub = useDyhub(demoRunning && demoSource === 'live' ? liveRoom : null, push, connect);
  const canStartDemo = demoSource === 'fake' || liveRoom !== null;

  // Only the editor saves: an OBS source opened from a link mustn't overwrite the editor's config.
  useEffect(() => {
    if (initial.obs) return;
    saveSettings(settings);
    demoSourceStore.write(demoSource);
    demoIntervalStore.write(demoIntervalMs);
    connectionStore.write(connection);
  }, [initial.obs, settings, demoSource, demoIntervalMs, connection]);

  const font = styles.font(fontFamily(settings), settings.fontSize);
  const list = <MessageList messages={messages} settings={settings} bare={initial.obs} />;

  if (initial.obs) {
    return <div {...stylex.props(styles.obs, font)}>{list}</div>;
  }

  const obsParams = settingsToParams(settings);
  obsParams.set('obs', '1');
  if (demoRunning && demoSource === 'fake') obsParams.set('demo', String(demoIntervalMs));
  if (demoRunning && demoSource === 'live' && liveRoom) setLiveRoomParams(obsParams, liveRoom);
  const obsUrl = `${window.location.origin}${window.location.pathname}?${obsParams.toString()}`;

  return (
    <Page
      xstyle={styles.editor}
      title="弹幕墙"
      actions={<Button onClick={() => setSettings(DEFAULT_SETTINGS)}>恢复默认样式</Button>}
    >
      <Column gap="lg">
        <Controls
          settings={settings}
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          obsUrl={obsUrl}
          demo={
            <DemoPanel
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
              onClear={() => setMessages([])}
              count={messages.length}
            />
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

/** Spawns fake messages at a jittered interval while running. */
function useDemo(running: boolean, intervalMs: number, push: (m: DanmakuMessage) => void) {
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        push(createFakeMessage());
        schedule(intervalMs * (0.3 + Math.random() * 1.4));
      }, delay);
    };
    schedule(Math.min(intervalMs, 300));
    return () => clearTimeout(timer);
  }, [running, intervalMs, push]);
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
