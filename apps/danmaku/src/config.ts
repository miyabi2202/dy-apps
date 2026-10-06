import type { Connection, DemoConfig } from '@dy-apps/services';
import type { CardStyle } from '@dy-apps/ui';

/** Everything the 弹幕墙 is set up with: the room as typed, the card style and the demo. */
export interface DanmakuConfig extends Connection {
  style: CardStyle;
  demo: DemoConfig;
}
