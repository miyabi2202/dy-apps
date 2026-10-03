import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import {
  connectDyhub,
  DYHUB_PORT_HINT,
  isRoomId,
  parsePort,
  type DyhubStatus,
} from '../adapters/dyhub';
import { ui } from './styles';
import { colors } from './tokens.stylex';

const STATUS_TEXT: Record<DyhubStatus | 'idle', string> = {
  idle: '未连接',
  opening: '连接中…',
  roomConnecting: '房间连接中…',
  ready: '已就绪',
  error: '连接失败',
  closed: '已断开',
};

/** Debug binding: connects to a local DyHub and forwards every event to the console. */
export function DyhubPanel() {
  const [portText, setPortText] = useState('');
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState<DyhubStatus | 'idle'>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => () => disconnectRef.current?.(), []);

  const connected = status === 'opening' || status === 'roomConnecting' || status === 'ready';
  const port = parsePort(portText.trim());
  const canConnect = port !== null && isRoomId(roomId.trim());

  const toggle = () => {
    disconnectRef.current?.();
    disconnectRef.current = null;
    if (connected) {
      setStatus('idle');
      setDetail(null);
      return;
    }
    if (port === null || !canConnect) return;
    disconnectRef.current = connectDyhub(port, roomId.trim(), {
      onStatus: (next, info) => {
        setStatus(next);
        setDetail(info ?? null);
        if (next === 'error') console.error('[dyhub]', info);
        else console.info('[dyhub]', STATUS_TEXT[next]);
      },
      onEvent: (ev) => {
        console.log('[dyhub]', ev.user?.nickname, ev.data?.content ?? ev.type, ev);
      },
    });
  };

  return (
    <section aria-label="DyHub 连接" {...stylex.props(ui.panel, styles.panel)}>
      <h2 {...stylex.props(ui.subTitle)}>DyHub 连接（调试）</h2>
      <form
        noValidate
        {...stylex.props(styles.row)}
        onSubmit={(e) => {
          e.preventDefault();
          toggle();
        }}
      >
        <label {...stylex.props(ui.muted, styles.field, styles.portField)}>
          端口
          <input
            value={portText}
            disabled={connected}
            inputMode="numeric"
            placeholder={DYHUB_PORT_HINT}
            onChange={(e) => setPortText(e.target.value)}
            {...stylex.props(ui.input)}
          />
        </label>
        <label {...stylex.props(ui.muted, styles.field)}>
          直播间号
          <input
            value={roomId}
            disabled={connected}
            inputMode="numeric"
            placeholder="如 708764876300"
            onChange={(e) => setRoomId(e.target.value)}
            {...stylex.props(ui.input)}
          />
        </label>
        <button
          type="submit"
          disabled={!connected && !canConnect}
          {...stylex.props(ui.button, !connected && ui.primary)}
        >
          {connected ? '断开' : '连接'}
        </button>
      </form>
      <p data-testid="dyhub-status" {...stylex.props(ui.muted, styles.status)}>
        状态：
        <span {...stylex.props(status === 'error' && styles.error)}>{STATUS_TEXT[status]}</span>
        {detail && `（${detail}）`} · 事件只输出到浏览器控制台，不影响游戏。
      </p>
    </section>
  );
}

const styles = stylex.create({
  panel: {
    gap: 8,
  },
  row: {
    gap: 8,
    alignItems: 'flex-end',
    display: 'flex',
    flexWrap: 'wrap',
  },
  field: {
    gap: 4,
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 160,
  },
  portField: {
    flexGrow: 0,
    minWidth: 0,
    width: 96,
  },
  status: {
    margin: 0,
  },
  error: {
    color: colors.curse,
  },
});
