import {
  Checkbox,
  CopyButton,
  Field,
  Grid,
  Input,
  Panel,
  Row,
  Select,
  Slider,
  text,
} from '@dy-apps/ui';
import { radius } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import {
  BORDER_LABELS,
  BORDER_STYLES,
  FONT_PRESETS,
  RANGES,
  type FontKey,
  type Settings,
} from '../settings';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  obsUrl: string;
  /** The demo panel, shown first. */
  demo: ReactNode;
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
        {props.demo}

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
          <Checkbox
            label="每位用户不同颜色"
            checked={settings.perUser}
            onChange={(e) => onChange({ perUser: e.target.checked })}
          />
          <Slider
            label="色相"
            value={settings.hue}
            min={RANGES.hue[0]}
            max={RANGES.hue[1]}
            disabled={settings.perUser}
            onChange={(hue) => onChange({ hue })}
            addon={
              !settings.perUser && (
                <span
                  {...stylex.props(
                    styles.swatch,
                    styles.swatchColor(`hsl(${settings.hue} 90% 66%)`),
                  )}
                />
              )
            }
          />
          <Slider
            label="粗细"
            value={settings.borderWidth}
            min={RANGES.borderWidth[0]}
            max={RANGES.borderWidth[1]}
            unit="px"
            onChange={(borderWidth) => onChange({ borderWidth })}
          />
          <Slider
            label="圆角"
            value={settings.radius}
            min={RANGES.radius[0]}
            max={RANGES.radius[1]}
            unit="px"
            onChange={(radius) => onChange({ radius })}
          />
          <Slider
            label="底色不透明度"
            value={settings.opacity}
            min={RANGES.opacity[0]}
            max={RANGES.opacity[1]}
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
            min={RANGES.fontSize[0]}
            max={RANGES.fontSize[1]}
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
  return (
    <>
      <Row gap="md">
        <Input readOnly aria-label="OBS 链接" value={url} onFocus={(e) => e.target.select()} />
        <CopyButton value={url} xstyle={styles.noShrink} />
      </Row>
      <p {...stylex.props(text.muted, styles.hint)}>
        在 OBS
        中添加「浏览器」来源并粘贴此链接，背景透明，宽高即弹幕区域大小。演示进行中复制的链接会自动开始同样的演示：模拟数据，或连接同一直播间。
      </p>
    </>
  );
}

const styles = stylex.create({
  noShrink: {
    flexShrink: 0,
  },
  swatch: {
    borderRadius: radius.pill,
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
