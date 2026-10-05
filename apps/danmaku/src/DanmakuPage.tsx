import * as stylex from '@stylexjs/stylex';
import { createStore } from '@dy-apps/local-storage';
import { Button, Column, Page, Row, text } from '@dy-apps/ui';
import { colors, fonts, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import { useCallback, useEffect, useState } from 'react';
import { COMMIT_HASH, SHORT_COMMIT_HASH } from './build';
import { createFakeMessage } from './demo';
import {
  DEFAULT_SETTINGS,
  fontFamily,
  loadSettings,
  saveSettings,
  settingsToParams,
  type Settings,
} from './settings';
import type { DanmakuMessage } from './types';
import { Controls, DEMO_INTERVAL_RANGE } from './ui/Controls';
import { MessageList } from './ui/MessageList';

/** Older messages are dropped past this, so a long stream doesn't grow memory forever. */
const MAX_MESSAGES = 1000;
const DEFAULT_DEMO_INTERVAL_MS = 900;

const demoIntervalStore = createStore('danmaku.demoIntervalMs', {
  fallback: DEFAULT_DEMO_INTERVAL_MS,
  parse: (raw) => (typeof raw === 'number' ? clampDemoInterval(raw) : undefined),
});

function clampDemoInterval(ms: number): number | undefined {
  const [min, max] = DEMO_INTERVAL_RANGE;
  return Number.isFinite(ms) ? Math.min(max, Math.max(min, ms)) : undefined;
}

interface PageOptions {
  /** `?obs=1`: overlay only, no editor chrome, transparent background. */
  obs: boolean;
  settings: Settings;
  /** `?demo=<ms>`: start the demo straight away (useful in an OBS source). */
  autoDemo: boolean;
  demoIntervalMs: number;
}

function optionsFromUrl(): PageOptions {
  const q = new URLSearchParams(window.location.search);
  const demo = q.get('demo');
  return {
    obs: q.get('obs') === '1',
    settings: loadSettings(window.location.search),
    autoDemo: demo !== null,
    demoIntervalMs: (demo && clampDemoInterval(Number(demo))) || demoIntervalStore.read(),
  };
}

/** The 弹幕墙 route: an editor with live preview, or (`?obs=1`) the bare overlay for OBS. */
export function DanmakuPage() {
  const [initial] = useState(optionsFromUrl);
  const [settings, setSettings] = useState(initial.settings);
  const [messages, setMessages] = useState<readonly DanmakuMessage[]>([]);
  const [demoRunning, setDemoRunning] = useState(initial.autoDemo);
  const [demoIntervalMs, setDemoIntervalMs] = useState(initial.demoIntervalMs);

  const push = useCallback((message: DanmakuMessage) => {
    setMessages((prev) => {
      const next = [...prev, message];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
  }, []);

  useDemo(demoRunning, demoIntervalMs, push);

  // Only the editor saves: an OBS source opened from a link mustn't overwrite the editor's config.
  useEffect(() => {
    if (initial.obs) return;
    saveSettings(settings);
    demoIntervalStore.write(demoIntervalMs);
  }, [initial.obs, settings, demoIntervalMs]);

  useEffect(() => {
    document.title = '弹幕墙';
  }, []);

  const font = styles.font(fontFamily(settings), settings.fontSize);
  const list = <MessageList messages={messages} settings={settings} bare={initial.obs} />;

  if (initial.obs) {
    return <div {...stylex.props(styles.obs, font)}>{list}</div>;
  }

  const obsParams = settingsToParams(settings);
  obsParams.set('obs', '1');
  if (demoRunning) obsParams.set('demo', String(demoIntervalMs));
  const obsUrl = `${window.location.origin}${window.location.pathname}?${obsParams.toString()}`;

  return (
    <Page xstyle={styles.editor}>
      <Column gap="lg">
        <Row gap="lg" justify="between">
          <h1 {...stylex.props(styles.title)}>
            弹幕墙
            <code title={COMMIT_HASH} data-testid="commit-hash" {...stylex.props(styles.commit)}>
              {SHORT_COMMIT_HASH}
            </code>
          </h1>
          <Button onClick={() => setSettings(DEFAULT_SETTINGS)}>恢复默认样式</Button>
        </Row>
        <Controls
          settings={settings}
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          demoRunning={demoRunning}
          onToggleDemo={() => setDemoRunning((r) => !r)}
          demoIntervalMs={demoIntervalMs}
          onDemoIntervalChange={setDemoIntervalMs}
          onClear={() => setMessages([])}
          count={messages.length}
          obsUrl={obsUrl}
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
  title: {
    margin: 0,
    gap: space.md,
    alignItems: 'baseline',
    display: 'flex',
    fontSize: 22,
  },
  commit: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: fontSize.xs,
    fontWeight: 400,
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
