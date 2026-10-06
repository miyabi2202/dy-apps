import {
  DEMO_INTERVAL_RANGE,
  DEMO_SOURCES,
  DYHUB_GUIDE_PATH,
  DYHUB_PORT_HINT,
  DYHUB_STATUS_TEXT,
  type Connection,
  type DemoIntervalRange,
  type DemoSource,
  type DyhubState,
  type DyhubStatus,
} from '@dy-apps/services';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { Button } from './button';
import { ConnectionForm } from './connection-form';
import { Select } from './form';
import { Row } from './layout';
import { sourcePanelText as t, testIds } from './messages';
import { Panel } from './panel';
import { Slider } from './slider';
import { text } from './text';
import { colors } from './tokens.stylex';

/** The live source retries after an error or a drop, so say so. */
const STATUS_TEXT: Record<DyhubStatus | 'idle', string> = {
  ...DYHUB_STATUS_TEXT,
  error: '连接失败，稍后重试',
  closed: '已断开，稍后重试',
};

interface SourcePanelProps {
  running: boolean;
  onToggle: () => void;
  /** False when the live source has no valid port and room number. */
  canStart: boolean;
  source: DemoSource;
  onSourceChange: (source: DemoSource) => void;
  intervalMs: number;
  onIntervalChange: (ms: number) => void;
  /** The slider's bounds and step, in ms; danmaku's by default. Shown in seconds from 1 s up. */
  interval?: { range: DemoIntervalRange; step: number };
  connection: Connection;
  onConnectionChange: (next: Connection) => void;
  liveState: DyhubState;
  /** The toggle's text for fake messages, stopped and running; the live source says 连接 / 断开. */
  fakeLabels?: { start: string; stop: string };
  /** More controls after the toggle, such as a clear button. */
  children?: ReactNode;
}

/** Picks fake messages or a live room through DyHub, and starts or stops them. */
export function SourcePanel(props: SourcePanelProps) {
  const {
    running,
    source,
    liveState,
    fakeLabels = t.fake,
    interval = { range: DEMO_INTERVAL_RANGE, step: 50 },
  } = props;
  const inSeconds = interval.range[0] >= 1000;
  // The live source connects to a room, so its button says so.
  const labels = source === 'live' ? t.live : fakeLabels;
  return (
    <Panel title={t.title} gap="md">
      {/* The panel title says what this picks, so no visible label of its own. */}
      <Select
        aria-label={t.title}
        value={source}
        disabled={running}
        onChange={(e) => props.onSourceChange(e.target.value as DemoSource)}
      >
        {DEMO_SOURCES.map((s) => (
          <option key={s} value={s}>
            {t.sources[s]}
          </option>
        ))}
      </Select>
      {source === 'fake' ? (
        <Slider
          label={t.interval}
          value={props.intervalMs}
          min={interval.range[0]}
          max={interval.range[1]}
          step={interval.step}
          unit={inSeconds ? 's' : 'ms'}
          format={inSeconds ? (ms) => String(ms / 1000) : String}
          onChange={props.onIntervalChange}
        />
      ) : (
        <ConnectionForm
          value={props.connection}
          onChange={props.onConnectionChange}
          connected={running}
          portPlaceholder={DYHUB_PORT_HINT}
        />
      )}
      <Row gap="md" wrap>
        <Button
          variant={running ? 'danger' : 'primary'}
          disabled={!running && !props.canStart}
          onClick={props.onToggle}
        >
          {running ? labels.stop : labels.start}
        </Button>
        {props.children}
      </Row>
      {source === 'live' && (
        <>
          <p data-testid={testIds.dyhubStatus} {...stylex.props(text.muted, styles.line)}>
            {running || props.canStart ? '状态：' : '请填写端口和直播间号 · 状态：'}
            <span {...stylex.props(liveState.status === 'error' && styles.error)}>
              {STATUS_TEXT[liveState.status]}
            </span>
            {liveState.detail && `（${liveState.detail}）`}
          </p>
          <p {...stylex.props(text.muted, styles.line)}>
            还没装 DyHub？看{' '}
            <a
              href={DYHUB_GUIDE_PATH}
              target="_blank"
              rel="noreferrer"
              {...stylex.props(styles.link)}
            >
              {t.guideLink}
            </a>
          </p>
        </>
      )}
    </Panel>
  );
}

const styles = stylex.create({
  line: {
    margin: 0,
  },
  error: {
    color: colors.danger,
  },
  link: {
    color: colors.accent,
  },
});
