import * as stylex from '@stylexjs/stylex';
import { useEffect, useState, type ReactNode } from 'react';
import { colors } from '../tokens.stylex';

const MONO = "ui-monospace, 'Cascadia Mono', Consolas, 'SFMono-Regular', Menlo, monospace";

/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => void copyText(text).then(setCopied)}
      {...stylex.props(styles.copy, copied && styles.copied)}
    >
      {copied ? '✓ 已复制' : label}
    </button>
  );
}

/** A command to paste into 命令提示符, with a big copy button. */
export function Cmd({ children }: { children: string }) {
  return (
    <figure {...stylex.props(styles.block)}>
      <figcaption {...stylex.props(styles.caption)}>在命令提示符输入，然后按回车</figcaption>
      <div {...stylex.props(styles.cmd)}>
        <code {...stylex.props(styles.cmdText)}>{children}</code>
        <CopyButton text={children} />
      </div>
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
      <figcaption {...stylex.props(styles.caption)}>{label}</figcaption>
      <pre {...stylex.props(styles.out)}>{children}</pre>
    </figure>
  );
}

/** An address to open in the browser. */
export function OpenLink({ href }: { href: string }) {
  return (
    <figure {...stylex.props(styles.block)}>
      <figcaption {...stylex.props(styles.caption)}>用浏览器打开这个地址</figcaption>
      <div {...stylex.props(styles.link)}>
        <a href={href} target="_blank" rel="noreferrer" {...stylex.props(styles.linkText)}>
          {href}
        </a>
        <div {...stylex.props(styles.linkButtons)}>
          <a href={href} target="_blank" rel="noreferrer" {...stylex.props(styles.open)}>
            打开 ↗
          </a>
          <CopyButton text={href} />
        </div>
      </div>
    </figure>
  );
}

type CalloutKind = 'tip' | 'warn' | 'bad';
const CALLOUT_ICON: Record<CalloutKind, string> = { tip: '💡', warn: '⚠️', bad: '❌' };

export function Callout({ kind = 'tip', children }: { kind?: CalloutKind; children: ReactNode }) {
  return (
    <aside {...stylex.props(styles.callout, calloutStyles[kind])}>
      <span aria-hidden {...stylex.props(styles.calloutIcon)}>
        {CALLOUT_ICON[kind]}
      </span>
      <div {...stylex.props(styles.calloutBody)}>{children}</div>
    </aside>
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
    marginBlock: 14,
    marginInline: 0,
  },
  caption: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 6,
  },
  cmd: {
    borderRadius: 10,
    gap: 12,
    paddingBlock: 10,
    alignItems: 'center',
    backgroundColor: colors.codeBg,
    display: 'flex',
    paddingInlineEnd: 10,
    paddingInlineStart: 16,
  },
  cmdText: {
    color: colors.codeText,
    flexGrow: 1,
    fontFamily: MONO,
    fontSize: 15,
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  copy: {
    borderRadius: 8,
    borderStyle: 'none',
    paddingInline: 14,
    backgroundColor: {
      default: colors.accent,
      ':hover': colors.accentHover,
    },
    color: colors.onAccent,
    cursor: 'pointer',
    flexShrink: 0,
    fontSize: 14,
    fontWeight: 600,
    outlineOffset: 2,
    minHeight: 36,
    minWidth: 72,
  },
  copied: {
    backgroundColor: {
      default: colors.done,
      ':hover': colors.done,
    },
  },
  out: {
    margin: 0,
    borderColor: colors.border,
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    paddingBlock: 10,
    paddingInline: 16,
    backgroundColor: colors.outputBg,
    color: colors.muted,
    fontFamily: MONO,
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowX: 'auto',
  },
  link: {
    borderColor: colors.border,
    borderRadius: 10,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: 10,
    paddingBlock: 10,
    paddingInline: 14,
    alignItems: 'center',
    backgroundColor: colors.surface,
    display: 'flex',
    flexWrap: 'wrap',
  },
  linkText: {
    color: colors.accent,
    flexGrow: 1,
    fontFamily: MONO,
    fontSize: 14,
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  linkButtons: {
    gap: 8,
    display: 'flex',
    flexShrink: 0,
  },
  open: {
    borderColor: colors.accent,
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingInline: 14,
    textDecoration: 'none',
    alignItems: 'center',
    color: colors.accent,
    display: 'inline-flex',
    fontSize: 14,
    fontWeight: 600,
    minHeight: 36,
  },
  callout: {
    borderRadius: 8,
    gap: 10,
    marginBlock: 14,
    paddingBlock: 10,
    paddingInline: 14,
    borderInlineStartStyle: 'solid',
    borderInlineStartWidth: 4,
    display: 'flex',
  },
  calloutIcon: {
    flexShrink: 0,
    lineHeight: 1.75,
  },
  calloutBody: {
    minWidth: 0,
  },
  inline: {
    borderRadius: 4,
    paddingBlock: 1,
    paddingInline: 5,
    backgroundColor: colors.outputBg,
    fontFamily: MONO,
    fontSize: '0.9em',
    overflowWrap: 'anywhere',
  },
  kbd: {
    borderColor: colors.border,
    borderRadius: 5,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingBlock: 1,
    paddingInline: 7,
    backgroundColor: colors.surface,
    fontFamily: 'inherit',
    fontSize: '0.88em',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    borderBottomWidth: 2,
  },
});

const calloutStyles = stylex.create({
  tip: { backgroundColor: colors.tipBg, borderInlineStartColor: colors.tipBorder },
  warn: { backgroundColor: colors.warnBg, borderInlineStartColor: colors.warnBorder },
  bad: { backgroundColor: colors.badBg, borderInlineStartColor: colors.badBorder },
});
