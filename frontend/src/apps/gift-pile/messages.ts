// Labels and test ids the page renders, shared with tests so both find an element by the same
// string. No runtime imports: Playwright specs load this file on its own.

export const testIds = {
  canvas: 'pile-canvas',
  count: 'count',
  stats: 'stats',
  width: 'width',
  height: 'height',
  bin: 'bin',
} as const;

export const labels = {
  title: '嘉年华堆堆乐（WIP）',
  subtitle: '输入数量，嘉年华从画面顶部落下，堆成一座山',
  panel: '添加嘉年华',
  count: '数量',
  add: '添加',
  remove: '减少',
  clear: '清空',
  stats: { total: '已添加', falling: '下落中', queued: '待添加' },
  size: {
    title: '画布尺寸',
    width: '宽度',
    height: '高度',
    apply: '应用尺寸',
    hint: '单位 px，宽 100–900，高 100–2000。应用新尺寸会清空当前的堆。',
  },
  bin: '垃圾桶',
  stageHint:
    '拖动图标可以移动它，拖到垃圾桶里就销毁。垃圾桶本身也可以拖动：减少时掉下来的图标落进垃圾桶也会被销毁。',
  engineFailed: '物理引擎启动失败：',
} as const;
