import { Button, Field, Grid, Input, Panel, Row, Select, text, useFieldId } from '@dy-apps/ui';
import { colors, fontSize, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import {
  BORDER_LABELS,
  BORDER_STYLES,
  FONT_PRESETS,
  RANGES,
  type FontKey,
  type Settings,
} from '../settings';

export const DEMO_INTERVAL_RANGE = [150, 3000] as const;

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  demoRunning: boolean;
  onToggleDemo: () => void;
  demoIntervalMs: number;
  onDemoIntervalChange: (ms: number) => void;
  onClear: () => void;
  count: number;
  obsUrl: string;
}

const FONT_OPTIONS = [
  ...Object.entries(FONT_PRESETS).map(([key, f]) => [key, f.label] as const),
  ['custom', '自定义…'] as const,
];

export function Controls(props: Props) {
  const { settings, onChange } = props;
  return (
    <section aria-label="弹幕设置">
      <Grid min={240} gap="lg">
        <Panel title="演示" gap="md">
          <Row gap="md" wrap>
            <Button variant={props.demoRunning ? 'danger' : 'primary'} onClick={props.onToggleDemo}>
              {props.demoRunning ? '停止演示' : '开始演示'}
            </Button>
            <Button onClick={props.onClear}>清空</Button>
            <span {...stylex.props(text.muted)}>{props.count} 条</span>
          </Row>
          <Slider
            label="平均间隔"
            value={props.demoIntervalMs}
            range={DEMO_INTERVAL_RANGE}
            step={50}
            unit="ms"
            onChange={props.onDemoIntervalChange}
          />
        </Panel>

        <Panel title="边框" gap="md">
          <Field label="样式">
            <Select
              value={settings.border}
              onChange={(e) => onChange({ border: e.target.value as Settings['border'] })}
            >
              {BORDER_STYLES.map((b) => (
                <option key={b} value={b}>
                  {BORDER_LABELS[b]}
                </option>
              ))}
            </Select>
          </Field>
          <label {...stylex.props(styles.check)}>
            <input
              type="checkbox"
              checked={settings.perUser}
              onChange={(e) => onChange({ perUser: e.target.checked })}
            />
            每位用户不同颜色
          </label>
          <Slider
            label="色相"
            value={settings.hue}
            range={RANGES.hue}
            disabled={settings.perUser}
            onChange={(hue) => onChange({ hue })}
            swatch={`hsl(${settings.hue} 90% 66%)`}
          />
          <Slider
            label="粗细"
            value={settings.borderWidth}
            range={RANGES.borderWidth}
            unit="px"
            onChange={(borderWidth) => onChange({ borderWidth })}
          />
          <Slider
            label="圆角"
            value={settings.radius}
            range={RANGES.radius}
            unit="px"
            onChange={(radius) => onChange({ radius })}
          />
          <Slider
            label="底色不透明度"
            value={settings.opacity}
            range={RANGES.opacity}
            unit="%"
            onChange={(opacity) => onChange({ opacity })}
          />
        </Panel>

        <Panel title="文字" gap="md">
          <Field label="字体">
            <Select
              value={settings.font}
              onChange={(e) => onChange({ font: e.target.value as FontKey })}
            >
              {FONT_OPTIONS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {settings.font === 'custom' && (
            <Field label="字体名称">
              <Input
                value={settings.customFont}
                placeholder="本机已安装的字体，如 LXGW WenKai"
                onChange={(e) => onChange({ customFont: e.target.value })}
              />
            </Field>
          )}
          <Slider
            label="字号"
            value={settings.fontSize}
            range={RANGES.fontSize}
            unit="px"
            onChange={(fontSize) => onChange({ fontSize })}
          />
        </Panel>

        <Panel title="OBS" gap="md">
          <ObsLink url={props.obsUrl} />
        </Panel>
      </Grid>
    </section>
  );
}

function ObsLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <>
      <Row gap="md">
        <Input readOnly aria-label="OBS 链接" value={url} onFocus={(e) => e.target.select()} />
        <Button onClick={copy} xstyle={styles.noShrink}>
          {copied ? '已复制' : '复制'}
        </Button>
      </Row>
      <p {...stylex.props(text.muted, styles.hint)}>
        在 OBS
        中添加「浏览器」来源并粘贴此链接，背景透明，宽高即弹幕区域大小。演示进行中复制的链接会自动播放演示弹幕。
      </p>
    </>
  );
}

interface SliderProps {
  label: string;
  value: number;
  range: readonly [number, number];
  onChange: (value: number) => void;
  step?: number;
  unit?: string;
  disabled?: boolean;
  swatch?: string;
}

function Slider(props: SliderProps) {
  return (
    <Field label={props.label}>
      <SliderControl {...props} />
    </Field>
  );
}

/** A range input with its current value; takes the Field's id so the label points at it. */
function SliderControl({
  value,
  range,
  onChange,
  step = 1,
  unit = '',
  disabled,
  swatch,
}: SliderProps) {
  const id = useFieldId();
  return (
    <Row gap="md">
      <input
        id={id}
        type="range"
        min={range[0]}
        max={range[1]}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        {...stylex.props(styles.grow)}
      />
      {swatch && !disabled && <span {...stylex.props(styles.swatch, styles.swatchColor(swatch))} />}
      <output htmlFor={id} {...stylex.props(styles.value, disabled && styles.dim)}>
        {value}
        {unit}
      </output>
    </Row>
  );
}

const styles = stylex.create({
  check: {
    gap: space.sm,
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSize.sm,
  },
  grow: {
    flexGrow: 1,
    minWidth: 0,
  },
  noShrink: {
    flexShrink: 0,
  },
  value: {
    fontSize: fontSize.xs,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'end',
    width: 52,
  },
  dim: { color: colors.muted },
  swatch: {
    borderRadius: '50%',
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  swatchColor: (color: string) => ({ backgroundColor: color }),
  hint: {
    margin: 0,
    lineHeight: 1.5,
  },
});
