import type { Connection } from '@dy-apps/services';
import type { Settings } from './settings';

export const DEMO_INTERVAL_RANGE = [150, 3000] as const;

export const DEMO_SOURCES = ['fake', 'live'] as const;
export type DemoSource = (typeof DEMO_SOURCES)[number];

/** Everything the 弹幕墙 is set up with: the room as typed, the card style and the demo. */
export interface DanmakuConfig extends Connection {
  style: Settings;
  demo: {
    source: DemoSource;
    /** Time between fake messages. */
    intervalMs: number;
  };
}
