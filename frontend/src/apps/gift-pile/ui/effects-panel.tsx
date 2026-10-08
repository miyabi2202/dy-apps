import { Checkbox, Disclosure, Field, Select, text } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { labels, testIds } from '../messages';
import type { EffectSettings } from '../settings';

interface Props {
  effects: EffectSettings;
  onChange: (effects: EffectSettings) => void;
}

/** The showy extras to turn on or off, and the quality to draw them at, in a section that stays closed until opened. */
export function EffectsPanel({ effects, onChange }: Props) {
  return (
    <Disclosure summary={labels.effects.summary} data-testid={testIds.effects}>
      <p {...stylex.props(text.muted, styles.hint)}>{labels.effects.hint}</p>
      <div {...stylex.props(styles.grid)}>
        <Checkbox
          label={labels.effects.cutIns}
          checked={effects.cutIns}
          onChange={(event) => onChange({ ...effects, cutIns: event.target.checked })}
        />
        <Checkbox
          label={labels.effects.shake}
          checked={effects.shake}
          onChange={(event) => onChange({ ...effects, shake: event.target.checked })}
        />
        <Field label={labels.effects.quality}>
          <Select
            data-testid={testIds.quality}
            value={effects.quality}
            onChange={(event) =>
              onChange({ ...effects, quality: event.target.value === 'low' ? 'low' : 'high' })
            }
          >
            <option value="high">{labels.effects.high}</option>
            <option value="low">{labels.effects.low}</option>
          </Select>
        </Field>
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  },
});
