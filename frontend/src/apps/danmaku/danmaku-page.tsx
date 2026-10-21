import * as stylex from '@stylexjs/stylex';
import {
  addMessage,
  createFakeMessage,
  fakeMessageAt,
  liveRoomFrom,
  urlSource,
  type Connection,
  type DanmakuMessage,
  type Logger,
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
  type CreateRoomFeedClient,
} from '@dy-apps/ui';
import { colors, radius, space } from '@dy-apps/ui/tokens.stylex';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { configToParams, readConfig, saveConfig, type DanmakuConfig } from './config';
import { log as moduleLog } from './log';
import { createMessageLogger } from './message-log';
import { Controls } from './ui/controls';
import { useWallFeed } from './use-wall-feed';

/** Older messages are dropped past this, so a long stream doesn't grow memory forever. */
const MAX_MESSAGES = 1000;

interface PageOptions {
  /** `?obs=1`: overlay only, no editor chrome, transparent background. */
  obs: boolean;
  /** `?demo=<ms>` or `?port=…&room=…`: start the demo straight away (useful in an OBS source). */
  autoDemo: boolean;
  /** `?logmsg=1`: log every message that reaches the wall to the console, for debugging. */
  logMessages: boolean;
  /** From the URL where it says, otherwise what was saved last time. */
  config: DanmakuConfig;
}

function optionsFromUrl(): PageOptions {
  const { search } = window.location;
  const q = new URLSearchParams(search);
  return {
    obs: q.get('obs') === '1',
    logMessages: q.get('logmsg') === '1',
    autoDemo: urlSource(search) !== null,
    config: readConfig(search),
  };
}

interface Props {
  /** Swapped for a fake in tests. */
  createClient?: CreateRoomFeedClient;
  /** The debug log (`[danmaku]` in the console); swapped for one with a fake sink in tests. */
  logger?: Logger;
  /** Where `?logmsg=1` writes each message; the console by default. */
  log?: (...data: unknown[]) => void;
}

/** The 弹幕墙 route: an editor with live preview, or (`?obs=1`) the bare overlay for OBS. */
export function DanmakuPage({ createClient, logger = moduleLog, log = console.log }: Props) {
  const [initial] = useState(optionsFromUrl);
  const { config } = initial;
  const logMessage = useMemo(() => createMessageLogger(logger), [logger]);
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

  // Every message, live or fake, comes through here: chat, gifts, and likes once batched.
  const push = useCallback(
    (message: DanmakuMessage) => {
      if (initial.logMessages) log('[弹幕墙]', message);
      logMessage(message);
      setMessages((prev) => addMessage(prev, message, MAX_MESSAGES));
    },
    [initial.logMessages, log, logMessage],
  );

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
  const feed = useWallFeed(
    demoRunning && demoSource === 'live' ? liveRoom : null,
    push,
    createClient,
    undefined,
    logger,
  );

  // Once on start: how the page was opened and what it read.
  useEffect(() => {
    logger.debug(
      `start: ${initial.obs ? 'obs view' : 'editor'}, demo ${initial.autoDemo ? 'on' : 'off'} ` +
        `(source ${config.demo.source}, ${config.demo.intervalMs}ms, random ${config.demo.random !== false}), ` +
        `room ${config.port || '-'}:${config.roomId || '-'}, style ${cardStyleToParams(config.style).toString()}`,
    );
  }, [initial, config, logger]);

  // The demo starting and stopping, from the button or the URL.
  useEffect(() => {
    if (demoRunning) {
      logger.debug(`demo: started, source ${demoSource}, every ${demoIntervalMs}ms`);
      return () => logger.debug('demo: stopped');
    }
  }, [demoRunning, demoSource, demoIntervalMs, logger]);

  // The wall is capped: say when it fills and old messages start to drop.
  const full = messages.length >= MAX_MESSAGES;
  useEffect(() => {
    if (full) logger.debug(`wall: ${MAX_MESSAGES} messages, dropping the oldest`);
  }, [full, logger]);
  const canStartDemo = demoSource === 'fake' || liveRoom !== null;

  // Only the editor saves: an OBS source opened from a link mustn't overwrite the editor's config.
  useEffect(() => {
    if (initial.obs) return;
    saveConfig({
      ...connection,
      style: settings,
      demo: { source: demoSource, intervalMs: demoIntervalMs },
    });
  }, [initial.obs, settings, demoSource, demoIntervalMs, connection]);

  const font = styles.font(fontFamily(settings), settings.fontSize);
  const list = <MessageList messages={messages} settings={settings} bare={initial.obs} />;

  if (initial.obs) {
    return <div {...stylex.props(styles.obs, font)}>{list}</div>;
  }

  const obsParams = configToParams(
    {
      ...connection,
      style: settings,
      demo: { source: demoSource, intervalMs: demoIntervalMs, random: demoRandom },
    },
    demoRunning,
  );
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
              liveState={feed}
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
