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
  debugViewer: (command: string) => `debug-viewer-${command}`,
  gameOverSummary: 'game-over-summary',
  giftHistory: 'gift-history',
  log: 'log',
  nextSettlement: 'next-settlement',
  likeMeter: 'like-meter',
  notice: (kind: 'cancelled' | 'quiet' | 'likes') => `notice-${kind}`,
  overlay: (phase: Phase) => `overlay-${phase}`,
  panelTeam: 'panel-team',
  pending: 'pending',
  preview: 'preview',
  previewFog: 'preview-fog',
  speed: 'speed',
  stats: 'stats',
  vote: 'vote',
  voteOption: (i: number) => `vote-option-${i}`,
  debugVote: (choice: string) => `debug-vote-${choice}`,
  viewerControl: 'viewer-control',
  viewerInput: 'viewer-input',
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
