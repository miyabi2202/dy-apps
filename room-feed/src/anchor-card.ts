import type { Pace } from '@dy-apps/douyin-chrome';
import { closeDownloadGuide, type DownloadGuide } from './download-guide';

/**
 * The card of a streamer in a PK (avatar, 「去TA直播间」, 粉丝团), which opens when a click on the
 * player lands on their tile: the one that starts the player, or the like's. It has no ×, and its
 * mask covers the whole page, taking every click until the card is closed by a click off it.
 */
export interface AnchorCard {
  /** Whether the card shows. */
  cardShown(): Promise<boolean>;
  /** Clicks the page off the card, on its mask, which closes it. */
  clickOffCard(): Promise<void>;
}

/** Closes the card if it shows, as a step: the card seen, a pause, the click off it. */
export async function closeAnchorCard(card: AnchorCard, pace: Pace): Promise<void> {
  if (!(await card.cardShown())) return;
  await pace.afterSeen(() => card.clickOffCard().catch(() => {}));
}

/** What can show over the page and take the clicks meant for what's under it. */
export type PagePopups = DownloadGuide & AnchorCard;

/** Closes the download popup and the card, each if it shows: what a step that clicks the page does first. */
export async function closePopups(popups: PagePopups, pace: Pace): Promise<void> {
  await closeDownloadGuide(popups, pace);
  await closeAnchorCard(popups, pace);
}
