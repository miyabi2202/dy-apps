import type { DemoSource } from '@dy-apps/services';

// Labels and test ids the components render, shared with tests so both find an element by
// the same string. Type-only imports: Playwright specs load this file on its own.

export const testIds = {
  commitHash: 'commit-hash',
  danmakuList: 'danmaku-list',
  detail: 'detail',
  dyhubStatus: 'dyhub-status',
  fansClubLevel: 'fans-club-level',
  gift: 'gift',
  giftDiamonds: 'gift-diamonds',
  likes: 'likes',
} as const;

export const sourcePanelText = {
  /** The panel's title, and the source select's accessible name. */
  title: '数据来源',
  sources: { fake: '模拟数据', live: '直播间（DyHub）' } satisfies Record<DemoSource, string>,
  interval: '平均间隔',
  fake: { start: '开始预览', stop: '停止预览' },
  live: { start: '连接', stop: '断开' },
  guideLink: '安装教程 ↗',
} as const;

export const connectionFormText = {
  port: '端口',
  room: '直播间号',
  connect: '连接',
  disconnect: '断开',
} as const;

export const copyButtonText = { copy: '复制', copied: '✓ 已复制' } as const;

export const obsLinkText = { input: 'OBS 链接' } as const;
