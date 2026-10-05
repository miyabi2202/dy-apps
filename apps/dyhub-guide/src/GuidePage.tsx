import { createStore } from '@dy-apps/local-storage';
import { Button, Column, Grid, Page, Panel, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { SECTIONS, type GuideSection } from './content';

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
    <Page xstyle={styles.page}>
      <div {...stylex.props(styles.layout)}>
        <nav aria-label="目录" {...stylex.props(styles.toc)}>
          <Column gap="md">
            <p {...stylex.props(text.caption)}>目录</p>
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
          </Column>
        </nav>

        <Column gap="xxl" xstyle={styles.main}>
          <header>
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
            <Grid min={230} gap="md">
              {STEPS.map((s) => (
                <a key={s.id} href={`#${s.id}`} {...stylex.props(styles.overviewLink)}>
                  <span {...stylex.props(styles.badge, done.has(s.id) && styles.badgeDone)}>
                    {done.has(s.id) ? '✓' : s.step}
                  </span>
                  {s.title}
                </a>
              ))}
            </Grid>
          </header>

          {SECTIONS.map((s) => (
            <Section key={s.id} section={s} done={done.has(s.id)} onToggle={() => toggle(s.id)} />
          ))}

          <footer {...stylex.props(text.muted, styles.footer)}>
            遇到教程里没写到的问题，把命令提示符里的文字截图发给提供程序的人。
          </footer>
        </Column>
      </div>
    </Page>
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
    <Panel id={id} aria-labelledby={`${id}-title`} gap="sm" xstyle={styles.section}>
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
      <div>{body}</div>
      {step !== undefined && (
        <Button
          variant={done ? 'primary' : 'default'}
          aria-pressed={done}
          onClick={onToggle}
          xstyle={styles.doneButton}
        >
          {done ? `✓ 第 ${step} 步已完成（点击取消）` : `这一步完成了 ✓`}
        </Button>
      )}
    </Panel>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <Column gap="sm">
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
      <span {...stylex.props(text.muted)}>
        已完成 {done} / {total} 步
      </span>
    </Column>
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
    fontSize: 17,
    lineHeight: 1.75,
  },
  layout: {
    gap: space.xxl,
    marginInline: 'auto',
    paddingBlock: space.xxl,
    paddingInline: space.xl,
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
    fontSize: fontSize.md,
    position: 'sticky',
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
    top: space.xxl,
  },
  tocList: {
    margin: 0,
    padding: 0,
    gap: space.xxs,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  tocLink: {
    borderRadius: radius.sm,
    gap: space.md,
    paddingBlock: space.sm,
    paddingInline: space.md,
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
    color: colors.success,
    fontWeight: 700,
  },
  track: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.border,
    height: 6,
  },
  fill: (ratio: number) => ({
    backgroundColor: colors.success,
    transitionDuration: '300ms',
    transitionProperty: 'width',
    height: '100%',
    width: `${ratio * 100}%`,
  }),
  main: {
    minWidth: 0,
  },
  kicker: {
    margin: 0,
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  h1: {
    fontSize: {
      [WIDE]: 38,
      default: 30,
    },
    lineHeight: 1.25,
    marginBottom: space.lg,
    marginTop: space.sm,
  },
  lead: {
    marginBlock: space.md,
  },
  note: {
    borderRadius: radius.md,
    marginBlock: space.lg,
    paddingBlock: space.md,
    paddingInline: space.lg,
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    fontSize: 15,
  },
  overviewLink: {
    borderColor: {
      default: colors.border,
      ':hover': colors.accent,
    },
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: space.md,
    paddingBlock: space.md,
    paddingInline: space.md,
    textDecoration: 'none',
    alignItems: 'center',
    backgroundColor: colors.panel,
    color: colors.text,
    display: 'flex',
    fontSize: 15,
    height: '100%',
  },
  badge: {
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.accent,
    color: colors.onAccent,
    display: 'inline-flex',
    flexShrink: 0,
    fontSize: fontSize.md,
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
    backgroundColor: colors.success,
  },
  section: {
    paddingBlock: space.xxl,
    paddingInline: {
      [WIDE]: space.xxl,
      default: space.xl,
    },
    scrollMarginTop: space.xl,
  },
  h2: {
    margin: 0,
    gap: space.lg,
    alignItems: 'center',
    display: 'flex',
    fontSize: 23,
    lineHeight: 1.3,
  },
  stepLabel: {
    color: colors.muted,
    display: 'block',
    fontSize: fontSize.md,
    fontWeight: 600,
  },
  doneButton: {
    fontSize: fontSize.lg,
    fontWeight: 700,
    marginTop: space.lg,
    minHeight: 46,
    width: '100%',
  },
  footer: {
    textAlign: 'center',
  },
});
