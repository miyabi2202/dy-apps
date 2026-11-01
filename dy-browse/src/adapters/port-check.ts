import { connect } from 'node:net';

/** Whether something listens on `port` of this machine: a connection that opens means yes. */
export function isPortListening(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    const done = (listening: boolean) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}
