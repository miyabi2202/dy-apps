import { ConnectionForm, Panel, text, type Connection } from '@dy-apps/ui';
import { colors } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import {
  DYHUB_PORT_HINT,
  DYHUB_STATUS_TEXT,
  DyhubClient,
  liveRoomFrom,
  type DyhubStatus,
} from '@dy-apps/services';

/** Debug binding: connects to a local DyHub and forwards every event to the console. */
export function DyhubPanel() {
  const [connection, setConnection] = useState<Connection>({ port: '', roomId: '' });
  const [status, setStatus] = useState<DyhubStatus | 'idle'>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const clientRef = useRef<DyhubClient | null>(null);

  useEffect(() => () => clientRef.current?.close(), []);

  const connected = status === 'opening' || status === 'roomConnecting' || status === 'ready';
  const room = liveRoomFrom(connection);

  const toggle = () => {
    clientRef.current?.close();
    clientRef.current = null;
    if (connected) {
      setStatus('idle');
      setDetail(null);
      return;
    }
    if (!room) return;
    const client = new DyhubClient(room);
    client.onStatus((next, info) => {
      setStatus(next);
      setDetail(info ?? null);
      if (next === 'error') console.error('[dyhub]', info);
      else console.info('[dyhub]', DYHUB_STATUS_TEXT[next]);
    });
    client.onComment((ev) => console.log('[dyhub]', ev.user?.nickname, ev.data.content, ev));
    client.onGift((ev, added) => {
      const { giftName } = ev.data;
      const what = added ? `送出 ${giftName} +${added}` : `${giftName}（重复推送，不计数）`;
      console.log('[dyhub]', ev.user?.nickname, what, ev);
    });
    client.connect();
    clientRef.current = client;
  };

  return (
    <Panel aria-label="DyHub 连接" title="DyHub 连接（调试）" gap="md">
      <ConnectionForm
        value={connection}
        onChange={setConnection}
        connected={connected}
        canConnect={room !== null}
        onToggle={toggle}
        portPlaceholder={DYHUB_PORT_HINT}
      />
      <p data-testid="dyhub-status" {...stylex.props(text.muted, styles.status)}>
        状态：
        <span {...stylex.props(status === 'error' && styles.error)}>
          {DYHUB_STATUS_TEXT[status]}
        </span>
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
