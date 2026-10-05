import { Button, Row, text } from '@dy-apps/ui';
import { colors, fonts, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState, type ReactNode } from 'react';

/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable. */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Button
      variant="primary"
      onClick={() => void copyText(value).then(setCopied)}
      xstyle={styles.copy}
    >
      {copied ? '✓ 已复制' : '复制'}
    </Button>
  );
}

/** A command to paste into 命令提示符, with a big copy button. */
export function Cmd({ children }: { children: string }) {
  return (
    <figure {...stylex.props(styles.block)}>
      <figcaption {...stylex.props(text.muted, styles.caption)}>
        在命令提示符输入，然后按回车
      </figcaption>
      <Row gap="lg" xstyle={styles.cmd}>
        <code {...stylex.props(styles.cmdText)}>{children}</code>
        <CopyButton value={children} />
      </Row>
    </figure>
  );
}

/** Example of what the reader should see. Styled unlike a command so nobody types it. */
export function Out({
  children,
  label = '你会看到类似这样的文字',
}: {
  children: string;
  label?: string;
}) {
  return (
    <figure {...stylex.props(styles.block)}>
      <figcaption {...stylex.props(text.muted, styles.caption)}>{label}</figcaption>
      <pre {...stylex.props(styles.out)}>{children}</pre>
    </figure>
  );
}

/** An address to open in the browser. */
export function OpenLink({ href }: { href: string }) {
  return (
    <figure {...stylex.props(styles.block)}>
      <figcaption {...stylex.props(text.muted, styles.caption)}>用浏览器打开这个地址</figcaption>
      <Row gap="md" wrap xstyle={styles.link}>
        <a href={href} target="_blank" rel="noreferrer" {...stylex.props(styles.linkText)}>
          {href}
        </a>
        <Row gap="md">
          <a href={href} target="_blank" rel="noreferrer" {...stylex.props(styles.open)}>
            打开 ↗
          </a>
          <CopyButton value={href} />
        </Row>
      </Row>
    </figure>
  );
}

type CalloutKind = 'tip' | 'warn' | 'bad';
const CALLOUT_ICON: Record<CalloutKind, string> = { tip: '💡', warn: '⚠️', bad: '❌' };

export function Callout({ kind = 'tip', children }: { kind?: CalloutKind; children: ReactNode }) {
  return (
    <Row gap="md" align="start" xstyle={[styles.callout, calloutStyles[kind]]}>
      <span aria-hidden {...stylex.props(styles.calloutIcon)}>
        {CALLOUT_ICON[kind]}
      </span>
      <div {...stylex.props(styles.calloutBody)}>{children}</div>
    </Row>
  );
}

/** Inline code or a file name. */
export function C({ children }: { children: ReactNode }) {
  return <code {...stylex.props(styles.inline)}>{children}</code>;
}

/** A keyboard key. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd {...stylex.props(styles.kbd)}>{children}</kbd>;
}

const styles = stylex.create({
  block: {
    marginBlock: space.lg,
    marginInline: 0,
  },
  caption: {
    marginBottom: space.sm,
  },
  cmd: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingBlock: space.md,
    backgroundColor: colors.bg,
    paddingInlineEnd: space.md,
    paddingInlineStart: space.xl,
  },
  cmdText: {
    color: colors.text,
    flexGrow: 1,
    fontFamily: fonts.mono,
    fontSize: 15,
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  copy: {
    flexShrink: 0,
    minWidth: 72,
  },
  out: {
    margin: 0,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    paddingBlock: space.md,
    paddingInline: space.xl,
    backgroundColor: colors.panelRaised,
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowX: 'auto',
  },
  link: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingBlock: space.md,
    paddingInline: space.lg,
    backgroundColor: colors.panelRaised,
  },
  linkText: {
    color: colors.accent,
    flexGrow: 1,
    fontFamily: fonts.mono,
    fontSize: fontSize.md,
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  // A link that looks like a default Button (an <a>, since it opens a page).
  open: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingInline: space.lg,
    textDecoration: 'none',
    alignItems: 'center',
    backgroundColor: {
      default: colors.panelRaised,
      ':hover': colors.border,
    },
    color: colors.text,
    display: 'inline-flex',
    fontSize: fontSize.md,
    minHeight: 36,
  },
  callout: {
    borderRadius: radius.md,
    marginBlock: space.lg,
    paddingBlock: space.md,
    paddingInline: space.lg,
    borderInlineStartStyle: 'solid',
    borderInlineStartWidth: 4,
  },
  calloutIcon: {
    flexShrink: 0,
    lineHeight: 1.75,
  },
  calloutBody: {
    minWidth: 0,
  },
  inline: {
    borderRadius: radius.sm,
    paddingBlock: 1,
    paddingInline: space.xs,
    backgroundColor: colors.panelRaised,
    fontFamily: fonts.mono,
    fontSize: '0.9em',
    overflowWrap: 'anywhere',
  },
  kbd: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingBlock: 1,
    paddingInline: space.sm,
    backgroundColor: colors.panelRaised,
    fontFamily: 'inherit',
    fontSize: '0.88em',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    borderBottomWidth: 2,
  },
});

const calloutStyles = stylex.create({
  tip: { backgroundColor: colors.accentSoft, borderInlineStartColor: colors.accent },
  warn: { backgroundColor: colors.warnSoft, borderInlineStartColor: colors.warn },
  bad: { backgroundColor: colors.dangerSoft, borderInlineStartColor: colors.danger },
});
