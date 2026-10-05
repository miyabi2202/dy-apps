import { ConnectionForm, Panel, text, type Connection } from '@dy-apps/ui';
import { colors } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import {
  connectDyhub,
  DYHUB_PORT_HINT,
  GiftCounter,
  type DyhubGiftData,
  isRoomId,
  parsePort,
  type DyhubStatus,
} from '@dy-apps/dyhub-client';

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
  const [connection, setConnection] = useState<Connection>({ port: '', roomId: '' });
  const [status, setStatus] = useState<DyhubStatus | 'idle'>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => () => disconnectRef.current?.(), []);

  const connected = status === 'opening' || status === 'roomConnecting' || status === 'ready';
  const port = parsePort(connection.port.trim());
  const roomId = connection.roomId.trim();
  const canConnect = port !== null && isRoomId(roomId);

  const toggle = () => {
    disconnectRef.current?.();
    disconnectRef.current = null;
    if (connected) {
      setStatus('idle');
      setDetail(null);
      return;
    }
    if (port === null || !canConnect) return;
    const gifts = new GiftCounter();
    disconnectRef.current = connectDyhub(port, roomId, {
      onStatus: (next, info) => {
        setStatus(next);
        setDetail(info ?? null);
        if (next === 'error') console.error('[dyhub]', info);
        else console.info('[dyhub]', STATUS_TEXT[next]);
      },
      onEvent: (ev) => {
        if (ev.type === 'gift') {
          const added = gifts.add(ev);
          const { giftName } = ev.data as unknown as DyhubGiftData;
          const what = added ? `送出 ${giftName} +${added}` : `${giftName}（重复推送，不计数）`;
          console.log('[dyhub]', ev.user?.nickname, what, ev);
          return;
        }
        console.log('[dyhub]', ev.user?.nickname, ev.data?.content ?? ev.type, ev);
      },
    });
  };

  return (
    <Panel aria-label="DyHub 连接" title="DyHub 连接（调试）" gap="md">
      <ConnectionForm
        value={connection}
        onChange={setConnection}
        connected={connected}
        canConnect={canConnect}
        onToggle={toggle}
        portPlaceholder={DYHUB_PORT_HINT}
      />
      <p data-testid="dyhub-status" {...stylex.props(text.muted, styles.status)}>
        状态：
        <span {...stylex.props(status === 'error' && styles.error)}>{STATUS_TEXT[status]}</span>
        {detail && `（${detail}）`} · 事件只输出到浏览器控制台，不影响游戏。
      </p>
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
