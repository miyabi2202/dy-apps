import type { Frame, Locator, Page } from 'playwright-core';
import type { FansLampSurface, PanelFrame, PanelTarget } from '../fans-lamp';
import {
  FANS_ICON,
  FANS_JOIN_BUTTON,
  FANS_LAMP_BUTTON,
  FANS_LAMP_SENT,
  FOLLOW_BUTTON,
  NOTICE_OK_TEXT,
  PAGE_WAIT,
  PANEL_TEXT,
  ROOM_INFO_BAR,
} from '../douyin/page-map';
import type { PageChrome } from './page-chrome';

/** One frame of the 粉丝团 panel, its targets found by the page map's selectors and texts. */
class PagePanelFrame implements PanelFrame {
  constructor(private readonly frame: Frame) {}

  async has(target: PanelTarget): Promise<boolean> {
    return (
      (await this.find(target)
        .count()
        .catch(() => 0)) > 0
    );
  }

  click(target: PanelTarget): Promise<void> {
    return this.find(target).first().click();
  }

  private find(target: PanelTarget): Locator {
    switch (target) {
      case 'notice':
        return this.frame.getByText(NOTICE_OK_TEXT, { exact: true });
      case 'join':
        return this.frame.locator(PANEL_TEXT).filter({ hasText: FANS_JOIN_BUTTON });
      case 'send':
        return this.frame.locator(PANEL_TEXT).filter({ hasText: FANS_LAMP_BUTTON });
      case 'sent':
        return this.frame.getByText(FANS_LAMP_SENT);
    }
  }
}

/** The Playwright side of the 灯牌 steps: Douyin's page, as the page map describes it. */
export class PageFansSurface implements FansLampSurface {
  private readonly follow: Locator;
  private readonly fans: Locator;

  constructor(
    private readonly page: Page,
    private readonly chrome: PageChrome,
  ) {
    const bar = page.locator(ROOM_INFO_BAR);
    this.follow = bar.locator('button').filter({ hasText: FOLLOW_BUTTON }).first();
    this.fans = bar
      .locator('button')
      .filter({ has: page.locator(FANS_ICON) })
      .first();
  }

  followVisible(): Promise<boolean> {
    return this.follow.isVisible().catch(() => false);
  }

  clickFollow(): Promise<void> {
    return this.follow.click();
  }

  waitForPanelButton(): Promise<void> {
    return this.fans.waitFor({ timeout: PAGE_WAIT.panel });
  }

  openPanel(): Promise<void> {
    return this.fans.click({ timeout: PAGE_WAIT.panel });
  }

  panelFrames(): PanelFrame[] {
    return this.page.frames().map((frame) => new PagePanelFrame(frame));
  }

  closeShown(): Promise<boolean> {
    return this.chrome.closeShown();
  }

  clickClose(): Promise<void> {
    return this.chrome.clickClose();
  }

  guideShown(): Promise<boolean> {
    return this.chrome.guideShown();
  }

  clickGuideClose(): Promise<void> {
    return this.chrome.clickGuideClose();
  }

  balance(): Promise<number | null> {
    return this.chrome.balance();
  }
}
