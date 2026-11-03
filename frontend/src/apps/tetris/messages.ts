import type { Phase } from './core/types';

// Labels and test ids the game renders, shared with tests so both find an element by the same
// string. Type-only imports: Playwright specs load this file on its own.

export const testIds = {
  activeEffects: 'active-effects',
  board: 'board',
  countdown: 'countdown',
  cutscene: 'cutscene',
  debugCurse: (type: string) => `debug-curse-${type}`,
  debugLikes: (n: number) => `debug-likes-${n}`,
  fakeDeathReveal: 'fake-death-reveal',
  gameOverSummary: 'game-over-summary',
  giftHistory: 'gift-history',
  log: 'log',
  nail: 'nail',
  mvp: 'mvp',
  nextSettlement: 'next-settlement',
  likeMeter: 'like-meter',
  notice: (kind: 'cancelled' | 'combo' | 'quiet' | 'likes' | 'reveal') => `notice-${kind}`,
  overlay: (phase: Phase) => `overlay-${phase}`,
  possess: 'possess',
  possessSeconds: 'possess-seconds',
  possessMagazine: 'possess-magazine',
  debugPossess: (command: string) => `debug-possess-${command}`,
  panelTeam: 'panel-team',
  pending: 'pending',
  preview: 'preview',
  previewFog: 'preview-fog',
  shove: 'shove',
  speed: 'speed',
  theft: 'theft',
  stats: 'stats',
  vote: 'vote',
  voteOption: (i: number) => `vote-option-${i}`,
  debugVote: (choice: string) => `debug-vote-${choice}`,
} as const;

export const labels = {
  start: '开始游戏',
  resume: '继续游戏',
  restart: '重新开始',
  touchControls: '鼠标/触屏操作',
  fakeGifts: { start: '开始模拟送礼', stop: '停止模拟送礼' },
  cutscene: { ready: 'READY', go: 'GO!' },
  debug: '调试：添加诅咒',
  extendVote: '+1秒',
} as const;
