import { useEffect, useState } from 'react';
import type * as stylex from '@stylexjs/stylex';
import { Button, type ButtonVariant } from './button';
import { copyButtonText as t } from './messages';

/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable. */
export async function copyText(value: string): Promise<boolean> {
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

interface CopyButtonProps {
  /** The text to copy. */
  value: string;
  variant?: ButtonVariant;
  xstyle?: stylex.StyleXStyles;
}

/** A 复制 button that shows "✓ 已复制" for a moment after copying. */
export function CopyButton({ value, variant, xstyle }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Button variant={variant} onClick={() => void copyText(value).then(setCopied)} xstyle={xstyle}>
      {copied ? t.copied : t.copy}
    </Button>
  );
}
