import {
  DYHUB_PORT_HINT,
  DYHUB_STATUS_TEXT,
  type Connection,
  type DyhubStatus,
} from '@dy-apps/services';
import { Button, ConnectionForm, Panel, Row, Select, Slider, text } from '@dy-apps/ui';
import { colors } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { DEMO_INTERVAL_RANGE, DEMO_SOURCES, type DemoSource } from '../config';
import type { DyhubState } from '../use-dyhub';

const SOURCE_LABELS: Record<DemoSource, string> = {
  fake: '模拟数据',
  live: '直播间（DyHub）',
};

/** useDyhub retries after an error or a drop, so say so. */
const STATUS_TEXT: Record<DyhubStatus | 'idle', string> = {
  ...DYHUB_STATUS_TEXT,
  error: '连接失败，稍后重试',
  closed: '已断开，稍后重试',
};

interface Props {
  running: boolean;
  onToggle: () => void;
  /** False when the live source has no valid port and room number. */
  canStart: boolean;
  source: DemoSource;
  onSourceChange: (source: DemoSource) => void;
  intervalMs: number;
  onIntervalChange: (ms: number) => void;
  connection: Connection;
  onConnectionChange: (next: Connection) => void;
  liveState: DyhubState;
  onClear: () => void;
  count: number;
}

/** Plays fake messages, or real chat from a live room through DyHub. */
export function DemoPanel(props: Props) {
  const { running, source, liveState } = props;
  return (
    <Panel title="数据来源" gap="md">
      {/* The panel title says what this picks, so no visible label of its own. */}
      <Select
        aria-label="数据来源"
        value={source}
        disabled={running}
        onChange={(e) => props.onSourceChange(e.target.value as DemoSource)}
      >
        {DEMO_SOURCES.map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABELS[s]}
          </option>
        ))}
      </Select>
      {source === 'fake' ? (
        <Slider
          label="平均间隔"
          value={props.intervalMs}
          min={DEMO_INTERVAL_RANGE[0]}
          max={DEMO_INTERVAL_RANGE[1]}
          step={50}
          unit="ms"
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
          {running ? '停止预览' : '开始预览'}
        </Button>
        <Button onClick={props.onClear}>清空</Button>
        <span {...stylex.props(text.muted)}>{props.count} 条</span>
      </Row>
      {source === 'live' && (
        <p data-testid="dyhub-status" {...stylex.props(text.muted, styles.status)}>
          {running || props.canStart ? '状态：' : '请填写端口和直播间号 · 状态：'}
          <span {...stylex.props(liveState.status === 'error' && styles.error)}>
            {STATUS_TEXT[liveState.status]}
          </span>
          {liveState.detail && `（${liveState.detail}）`}
        </p>
      )}
    </Panel>
  );
}

const styles = stylex.create({
  status: {
    margin: 0,
  },
  error: {
    color: colors.danger,
  },
});
