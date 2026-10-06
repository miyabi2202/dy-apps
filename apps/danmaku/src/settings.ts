import { createStore } from '@dy-apps/services';
import { cardStyleToParams, readCardStyle, type CardStyle } from '@dy-apps/ui';

/** Saved as the same query string as the OBS link, so `readCardStyle` validates it on load. */
const settingsStore = createStore('danmaku.settings', {
  fallback: '',
  parse: (raw) => (typeof raw === 'string' ? raw : undefined),
});

/** URL parameters win over the saved settings, which win over the defaults. */
export function loadSettings(search: string): CardStyle {
  return readCardStyle(search, readCardStyle(settingsStore.read()));
}

export function saveSettings(s: CardStyle): void {
  settingsStore.write(cardStyleToParams(s).toString());
}
