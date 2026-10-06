import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { Field, useFieldHintId, useFieldId } from './form';
import { Row } from './layout';
import { colors, fontSize } from './tokens.stylex';

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
  /** Shown after the value, e.g. "px" or "%". */
  unit?: string;
  /** How to show the value, if not as the number itself; `unit` still follows it. */
  format?: (value: number) => string;
  disabled?: boolean;
  /** Anything to show between the track and the value, e.g. a colour swatch. */
  addon?: ReactNode;
  /** A short explanation under the slider, read out with it. */
  hint?: ReactNode;
}

/** A labelled range input that shows its current value. */
export function Slider({ label, hint, ...control }: SliderProps) {
  return (
    <Field label={label} hint={hint}>
      <SliderControl {...control} />
    </Field>
  );
}

function SliderControl({
  value,
  min,
  max,
  onChange,
  step = 1,
  unit = '',
  format = String,
  disabled,
  addon,
}: Omit<SliderProps, 'label' | 'hint'>) {
  const id = useFieldId();
  const hintId = useFieldHintId();
  return (
    <Row gap="md">
      <input
        id={id}
        aria-describedby={hintId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        {...stylex.props(styles.track)}
      />
      {addon}
      <output htmlFor={id} {...stylex.props(styles.value, disabled && styles.dim)}>
        {format(value)}
        {unit}
      </output>
    </Row>
  );
}

const styles = stylex.create({
  track: {
    accentColor: colors.accent,
    flexGrow: 1,
    minWidth: 0,
  },
  value: {
    fontSize: fontSize.xs,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'end',
    width: 52,
  },
  dim: { color: colors.muted },
});
