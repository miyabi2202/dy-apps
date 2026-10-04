import * as stylex from '@stylexjs/stylex';
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  BORDER_LABELS,
  BORDER_STYLES,
  FONT_PRESETS,
  RANGES,
  type FontKey,
  type Settings,
} from '../settings';
import { colors } from '../tokens.stylex';

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
    <section aria-label="弹幕设置" {...stylex.props(styles.panel)}>
      <Group title="演示">
        <div {...stylex.props(styles.buttons)}>
          <button
            type="button"
            onClick={props.onToggleDemo}
            {...stylex.props(styles.button, props.demoRunning ? styles.stop : styles.primary)}
          >
            {props.demoRunning ? '停止演示' : '开始演示'}
          </button>
          <button type="button" onClick={props.onClear} {...stylex.props(styles.button)}>
            清空
          </button>
          <span {...stylex.props(styles.muted)}>{props.count} 条</span>
        </div>
        <Slider
          label="平均间隔"
          value={props.demoIntervalMs}
          range={DEMO_INTERVAL_RANGE}
          step={50}
          unit="ms"
          onChange={props.onDemoIntervalChange}
        />
      </Group>

      <Group title="边框">
        <Field label="样式">
          {(id) => (
            <select
              id={id}
              value={settings.border}
              onChange={(e) => onChange({ border: e.target.value as Settings['border'] })}
              {...stylex.props(styles.input)}
            >
              {BORDER_STYLES.map((b) => (
                <option key={b} value={b}>
                  {BORDER_LABELS[b]}
                </option>
              ))}
            </select>
          )}
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
      </Group>

      <Group title="文字">
        <Field label="字体">
          {(id) => (
            <select
              id={id}
              value={settings.font}
              onChange={(e) => onChange({ font: e.target.value as FontKey })}
              {...stylex.props(styles.input)}
            >
              {FONT_OPTIONS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {settings.font === 'custom' && (
          <Field label="字体名称">
            {(id) => (
              <input
                id={id}
                value={settings.customFont}
                placeholder="本机已安装的字体，如 LXGW WenKai"
                onChange={(e) => onChange({ customFont: e.target.value })}
                {...stylex.props(styles.input)}
              />
            )}
          </Field>
        )}
        <Slider
          label="字号"
          value={settings.fontSize}
          range={RANGES.fontSize}
          unit="px"
          onChange={(fontSize) => onChange({ fontSize })}
        />
      </Group>

      <Group title="OBS">
        <ObsLink url={props.obsUrl} />
      </Group>
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
      <div {...stylex.props(styles.buttons)}>
        <input
          readOnly
          aria-label="OBS 链接"
          value={url}
          onFocus={(e) => e.target.select()}
          {...stylex.props(styles.input, styles.grow)}
        />
        <button type="button" onClick={copy} {...stylex.props(styles.button)}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <p {...stylex.props(styles.muted, styles.hint)}>
        在 OBS
        中添加「浏览器」来源并粘贴此链接，背景透明，宽高即弹幕区域大小。演示进行中复制的链接会自动播放演示弹幕。
      </p>
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset {...stylex.props(styles.group)}>
      <legend {...stylex.props(styles.legend)}>{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div {...stylex.props(styles.field)}>
      <label htmlFor={id} {...stylex.props(styles.label)}>
        {label}
      </label>
      {children(id)}
    </div>
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

function Slider({
  label,
  value,
  range,
  onChange,
  step = 1,
  unit = '',
  disabled,
  swatch,
}: SliderProps) {
  return (
    <Field label={label}>
      {(id) => (
        <div {...stylex.props(styles.sliderRow)}>
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
          {swatch && !disabled && (
            <span {...stylex.props(styles.swatch, styles.swatchColor(swatch))} />
          )}
          <output htmlFor={id} {...stylex.props(styles.value, disabled && styles.dim)}>
            {value}
            {unit}
          </output>
        </div>
      )}
    </Field>
  );
}

const styles = stylex.create({
  panel: {
    gap: 12,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  },
  group: {
    margin: 0,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: 10,
    paddingBlock: 12,
    paddingInline: 14,
    backgroundColor: colors.panel,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  legend: {
    padding: 0,
    color: colors.muted,
    float: 'left',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.02em',
    marginBottom: 2,
  },
  field: {
    gap: 4,
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    color: colors.muted,
    fontSize: 12,
  },
  input: {
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingInline: 8,
    backgroundColor: colors.panelRaised,
    color: colors.text,
    fontSize: 13,
    outlineColor: colors.accent,
    minHeight: 32,
    minWidth: 0,
  },
  check: {
    gap: 6,
    alignItems: 'center',
    display: 'flex',
    fontSize: 13,
  },
  sliderRow: {
    gap: 8,
    alignItems: 'center',
    display: 'flex',
  },
  grow: {
    flexGrow: 1,
    minWidth: 0,
  },
  value: {
    fontSize: 12,
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
  buttons: {
    gap: 8,
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
  },
  button: {
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    paddingInline: 12,
    backgroundColor: {
      default: colors.panelRaised,
      ':hover': colors.border,
    },
    color: colors.text,
    cursor: 'pointer',
    fontSize: 13,
    outlineColor: colors.accent,
    outlineOffset: 2,
    minHeight: 32,
  },
  primary: {
    borderColor: colors.accent,
    backgroundColor: {
      default: colors.accent,
      ':hover': '#7dd3fc',
    },
    color: '#0a0f1c',
    fontWeight: 600,
  },
  stop: {
    borderColor: '#f87171',
    backgroundColor: {
      default: '#f87171',
      ':hover': '#fca5a5',
    },
    color: '#0a0f1c',
    fontWeight: 600,
  },
  muted: {
    color: colors.muted,
    fontSize: 12,
  },
  hint: {
    margin: 0,
    lineHeight: 1.5,
  },
});
