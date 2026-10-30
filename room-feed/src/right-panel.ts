import type { Pace } from './pace';

/** The panel on the right of the room page (the 粉丝团 one, the gift one, …), as far as closing it goes. */
export interface RightPanel {
  /** Whether its × shows, which it does while a panel is open. */
  closeShown(): Promise<boolean>;
  /** Clicks its ×. */
  clickClose(): Promise<void>;
}

/**
 * Closes the panel on the right if one is open, as a step: its × seen, a pause, the click. By the
 * ×: Escape doesn't close the panels, and one left open makes the next click that opens a panel
 * close it instead.
 */
export async function closeRightPanel(panel: RightPanel, pace: Pace): Promise<void> {
  if (!(await panel.closeShown())) return;
  await pace.afterSeen(() => panel.clickClose().catch(() => {}));
}
