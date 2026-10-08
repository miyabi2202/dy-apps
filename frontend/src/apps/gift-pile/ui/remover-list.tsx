import { Checkbox, Disclosure, text } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { labels, testIds } from '../messages';

interface Props {
  /** Every remover, by name, in the order to list them. */
  names: readonly string[];
  /** The ones turned on, and what to do when that changes. */
  enabled: ReadonlySet<string>;
  onChange: (enabled: ReadonlySet<string>) => void;
}

/**
 * A checkbox for each remover, to turn it on or off, in a section that stays closed until
 * opened. The last one on can't be turned off, so a removal always has one to go with.
 */
export function RemoverList({ names, enabled, onChange }: Props) {
  const on = names.filter((name) => enabled.has(name)).length;
  const toggle = (name: string, checked: boolean) => {
    const next = new Set(enabled);
    if (checked) next.add(name);
    else next.delete(name);
    onChange(next);
  };
  return (
    <Disclosure
      summary={`${labels.removers.summary}（${on}/${names.length}）`}
      data-testid={testIds.removers}
    >
      <p {...stylex.props(text.muted, styles.hint)}>{labels.removers.hint}</p>
      <div {...stylex.props(styles.grid)}>
        {names.map((name) => {
          const checked = enabled.has(name);
          return (
            <Checkbox
              key={name}
              label={labels.removers.names[name] ?? name}
              checked={checked}
              disabled={checked && on === 1}
              onChange={(event) => toggle(name, event.target.checked)}
            />
          );
        })}
      </div>
    </Disclosure>
  );
}

const styles = stylex.create({
  hint: {
    margin: 0,
    marginBlock: space.sm,
    lineHeight: 1.5,
  },
  grid: {
    gap: space.sm,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
  },
});
