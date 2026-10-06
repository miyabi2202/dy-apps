// Labels and test ids the page renders, shared with tests so both find an element by the same
// string. No runtime imports: Playwright specs load this file on its own.

export const testIds = {
  canvas: 'pile-canvas',
  count: 'count',
  stats: 'stats',
} as const;

export const labels = {
  title: '嘉年华堆堆乐',
  subtitle: '输入数量，嘉年华从画面顶部落下，堆成一座山',
  panel: '控制',
  count: '数量',
  add: '添加',
  clear: '清空',
  stats: { total: '已添加', falling: '下落中', queued: '待添加' },
} as const;
