import {
  createSourceStores,
  readSourceConfig,
  saveSourceConfig,
  setSourceParams,
  type SourceConfig,
} from '@dy-apps/services';
import { cardStyleToParams, type CardStyle } from '@dy-apps/ui';
import { loadSettings, saveSettings } from './settings';

/** Everything the 弹幕墙 is set up with: the room as typed, the demo and the card style. */
export interface DanmakuConfig extends SourceConfig {
  style: CardStyle;
}

const stores = createSourceStores('danmaku', { source: 'fake', intervalMs: 900 });

/** The source from the URL or what was saved (see readSourceConfig), plus the card style. */
export function readConfig(search: string): DanmakuConfig {
  return { ...readSourceConfig(search, stores), style: loadSettings(search) };
}

export function saveConfig(config: DanmakuConfig): void {
  saveSourceConfig(stores, config);
  saveSettings(config.style);
}

/**
 * Parameters for the OBS link: the card style and `obs=1`, and, while the preview is
 * `running`, the room or the fake interval it shows.
 */
export function configToParams(config: DanmakuConfig, running: boolean): URLSearchParams {
  const params = cardStyleToParams(config.style);
  params.set('obs', '1');
  if (running) setSourceParams(params, config);
  return params;
}
