// Labels and test ids the page renders, shared with tests so both find an element by the same
// string. No runtime imports: Playwright specs load this file on its own.

export const testIds = {
  canvas: 'pile-canvas',
  count: 'count',
  stats: 'stats',
  width: 'width',
  height: 'height',
  bin: 'bin',
  removers: 'removers',
  effects: 'effects',
  quality: 'quality',
  cutIn: 'cut-in',
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
  removers: {
    summary: '清除动画',
    hint: '每次减少从勾选的动画中轮流随机选一种，至少保留一种。',
    names: {
      helicopter: '直升机',
      ufo: '飞碟',
      balloon: '热气球',
      car: '超跑',
      'pac-man': '吃豆人',
      claw: '娃娃机',
      fireworks: '烟花',
      'black-hole': '黑洞',
      evanesco: '消失咒',
    } as Record<string, string>,
  },
  effects: {
    summary: '炫酷特效',
    cutIns: '切入画面',
    shake: '震屏',
    quality: '画质',
    high: '高',
    low: '低',
    hint: '画质选低会关闭辉光并减少粒子，手机或旧电脑建议选低。系统设置了“减少动态效果”时，震屏和定格不会出现。',
  },
  cutIn: {
    lines: {
      helicopter: '空中救援！',
      ufo: '牵引光束启动',
      balloon: '悠然升空',
      car: '极速飞跃！',
      'pac-man': 'WAKA WAKA!',
      claw: '一击必中！',
      fireworks: '绽放！',
      'black-hole': '吞噬一切！',
      evanesco: '消隐无踪！Evanesco!',
    } as Record<string, string>,
  },
  bin: '垃圾桶',
  stageHint:
    '拖动图标可以移动它，拖到垃圾桶里就销毁。垃圾桶本身也可以拖动：减少时掉下来的图标落进垃圾桶也会被销毁。',
  engineFailed: '物理引擎启动失败：',
  webglMissing: '浏览器不支持 WebGL2，无法绘制。',
} as const;
