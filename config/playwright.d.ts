import type { PlaywrightTestConfig } from '@playwright/test';

export interface PlaywrightPresetOptions {
  /** App directory: holds the Vite config and tests/integration. */
  appRoot: string;
  /** Port for `vite preview`. Default 4173. */
  port?: number;
}

export declare function createPlaywrightConfig(
  options: PlaywrightPresetOptions,
): PlaywrightTestConfig;
