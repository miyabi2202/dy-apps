import { createStore } from '@dy-apps/local-storage';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { SECTIONS, type GuideSection } from './content';
import { colors } from './tokens.stylex';

const TITLE = 'Windows 新手安装教程';
const STEPS = SECTIONS.filter((s) => s.step !== undefined);

/** Ids of the steps the reader has ticked off, kept between visits. */
const doneStore = createStore<string[]>('dyhub-guide.done', {
  fallback: [],
  parse: (raw) =>
    Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : undefined,
});

/** The DyHub Windows install guide for streamers. */
export function GuidePage() {
  const [done, setDone] = useState(() => new Set(doneStore.read()));
  const active = useActiveSection();

  useEffect(() => {
    document.title = `DyHub ${TITLE}`;
    // The page loads lazily, after the browser's own jump to #step-n has already failed.
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      doneStore.write([...next]);
      return next;
    });
  };

  const doneCount = STEPS.filter((s) => done.has(s.id)).length;

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.layout)}>
        <nav aria-label="目录" {...stylex.props(styles.toc)}>
          <p {...stylex.props(styles.tocTitle)}>目录</p>
          <Progress done={doneCount} total={STEPS.length} />
          <ol {...stylex.props(styles.tocList)}>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? 'location' : undefined}
                  {...stylex.props(styles.tocLink, active === s.id && styles.tocActive)}
                >
                  <span {...stylex.props(styles.tocMark, done.has(s.id) && styles.tocDone)}>
                    {done.has(s.id) ? '✓' : (s.step ?? '·')}
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main {...stylex.props(styles.main)}>
          <header {...stylex.props(styles.hero)}>
            <p {...stylex.props(styles.kicker)}>DyHub · 给主播的安装教程</p>
            <h1 {...stylex.props(styles.h1)}>{TITLE}</h1>
            <p {...stylex.props(styles.lead)}>
              这份教程手把手教你在 <b>Windows 10 / Windows 11</b> 电脑上把 DyHub
              跑起来。不需要任何编程基础，跟着一步一步做就行。
            </p>
            <p {...stylex.props(styles.note)}>
              本教程用到的所有下载地址，在国内都可以直接打开，不需要对网络做任何额外设置。
            </p>
            <p {...stylex.props(styles.lead)}>
              整个过程分为 {STEPS.length} 步，第一次大约需要 <b>20～30 分钟</b>：
            </p>
            <ol {...stylex.props(styles.overview)}>
              {STEPS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} {...stylex.props(styles.overviewLink)}>
                    <span {...stylex.props(styles.badge, done.has(s.id) && styles.badgeDone)}>
                      {done.has(s.id) ? '✓' : s.step}
                    </span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </header>

          {SECTIONS.map((s) => (
            <Section key={s.id} section={s} done={done.has(s.id)} onToggle={() => toggle(s.id)} />
          ))}

          <footer {...stylex.props(styles.footer)}>
            遇到教程里没写到的问题，把命令提示符里的文字截图发给提供程序的人。
          </footer>
        </main>
      </div>
    </div>
  );
}

function Section({
  section,
  done,
  onToggle,
}: {
  section: GuideSection;
  done: boolean;
  onToggle: () => void;
}) {
  const { id, step, title, body } = section;
  return (
    <section id={id} aria-labelledby={`${id}-title`} {...stylex.props(styles.section)}>
      <h2 id={`${id}-title`} {...stylex.props(styles.h2)}>
        {step !== undefined && (
          <span {...stylex.props(styles.badge, styles.badgeLarge, done && styles.badgeDone)}>
            {done ? '✓' : step}
          </span>
        )}
        <span>
          {step !== undefined && <span {...stylex.props(styles.stepLabel)}>第 {step} 步</span>}
          {title}
        </span>
      </h2>
      <div {...stylex.props(styles.body)}>{body}</div>
      {step !== undefined && (
        <button
          type="button"
          aria-pressed={done}
          onClick={onToggle}
          {...stylex.props(styles.doneButton, done && styles.doneButtonOn)}
        >
          {done ? `✓ 第 ${step} 步已完成（点击取消）` : `这一步完成了 ✓`}
        </button>
      )}
    </section>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div {...stylex.props(styles.progress)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="安装进度"
        {...stylex.props(styles.track)}
      >
        <div {...stylex.props(styles.fill(total ? done / total : 0))} />
      </div>
      <span {...stylex.props(styles.progressText)}>
        已完成 {done} / {total} 步
      </span>
    </div>
  );
}

/** The section currently nearest the top of the viewport, for highlighting the TOC. */
function useActiveSection(): string | undefined {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          setActive(visible[0]!.target.id);
        }
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

const WIDE = '@media (min-width: 1040px)';

const styles = stylex.create({
  page: {
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif",
    fontSize: 17,
    lineHeight: 1.75,
    minHeight: '100vh',
  },
  layout: {
    gap: 40,
    marginInline: 'auto',
    paddingBlock: {
      [WIDE]: 40,
      default: 20,
    },
    paddingInline: 16,
    display: {
      [WIDE]: 'grid',
      default: 'block',
    },
    gridTemplateColumns: '240px minmax(0, 760px)',
    justifyContent: 'center',
    maxWidth: 1100,
  },
  toc: {
    alignSelf: 'start',
    display: {
      [WIDE]: 'block',
      default: 'none',
    },
    fontSize: 14,
    position: 'sticky',
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
    top: 24,
  },
  tocTitle: {
    color: colors.muted,
    fontWeight: 700,
    marginBottom: 8,
    marginTop: 0,
  },
  tocList: {
    margin: 0,
    padding: 0,
    gap: 2,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  tocLink: {
    borderRadius: 6,
    gap: 8,
    paddingBlock: 6,
    paddingInline: 8,
    textDecoration: 'none',
    alignItems: 'center',
    backgroundColor: {
      default: 'transparent',
      ':hover': colors.accentSoft,
    },
    color: colors.text,
    display: 'flex',
    lineHeight: 1.4,
  },
  tocActive: {
    backgroundColor: {
      default: colors.accentSoft,
      ':hover': colors.accentSoft,
    },
    color: colors.accent,
    fontWeight: 600,
  },
  tocMark: {
    color: colors.muted,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'center',
    width: 18,
  },
  tocDone: {
    color: colors.done,
    fontWeight: 700,
  },
  progress: {
    gap: 6,
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 14,
  },
  track: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.border,
    height: 6,
  },
  fill: (ratio: number) => ({
    backgroundColor: colors.done,
    transitionDuration: '300ms',
    transitionProperty: 'width',
    height: '100%',
    width: `${ratio * 100}%`,
  }),
  progressText: {
    color: colors.muted,
    fontSize: 13,
  },
  main: {
    minWidth: 0,
  },
  hero: {
    marginBottom: 12,
  },
  kicker: {
    margin: 0,
    color: colors.accent,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  h1: {
    fontSize: {
      [WIDE]: 38,
      default: 30,
    },
    lineHeight: 1.25,
    marginBottom: 14,
    marginTop: 6,
  },
  lead: {
    marginBlock: 10,
  },
  note: {
    borderRadius: 8,
    marginBlock: 14,
    paddingBlock: 8,
    paddingInline: 14,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    fontSize: 15,
  },
  overview: {
    margin: 0,
    padding: 0,
    gap: 8,
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
  },
  overviewLink: {
    borderColor: {
      default: colors.border,
      ':hover': colors.accent,
    },
    borderRadius: 10,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: 10,
    paddingBlock: 8,
    paddingInline: 10,
    textDecoration: 'none',
    alignItems: 'center',
    backgroundColor: colors.surface,
    color: colors.text,
    display: 'flex',
    fontSize: 15,
  },
  badge: {
    borderRadius: '50%',
    alignItems: 'center',
    backgroundColor: colors.accent,
    color: colors.onAccent,
    display: 'inline-flex',
    flexShrink: 0,
    fontSize: 14,
    fontWeight: 700,
    justifyContent: 'center',
    height: 28,
    width: 28,
  },
  badgeLarge: {
    fontSize: 18,
    height: 40,
    width: 40,
  },
  badgeDone: {
    backgroundColor: colors.done,
  },
  section: {
    borderColor: colors.border,
    borderRadius: 14,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingBlock: 22,
    paddingInline: {
      [WIDE]: 28,
      default: 18,
    },
    backgroundColor: colors.surface,
    marginTop: 24,
    scrollMarginTop: 16,
  },
  h2: {
    margin: 0,
    gap: 14,
    alignItems: 'center',
    display: 'flex',
    fontSize: 23,
    lineHeight: 1.3,
  },
  stepLabel: {
    color: colors.muted,
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
  },
  body: {
    marginTop: 8,
  },
  doneButton: {
    borderColor: colors.accent,
    borderRadius: 10,
    borderStyle: 'solid',
    borderWidth: 2,
    paddingInline: 20,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors.accentSoft,
    },
    color: colors.accent,
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 700,
    marginTop: 18,
    minHeight: 46,
    width: '100%',
  },
  doneButtonOn: {
    borderColor: colors.done,
    backgroundColor: {
      default: colors.done,
      ':hover': colors.done,
    },
    color: colors.onAccent,
  },
  footer: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
});
