import type { PlaywrightTestConfig } from '@playwright/test';

export interface PlaywrightPresetOptions {
  /** Site directory: holds the Vite config and integration-tests. Each app's integration-tests run too. */
  appRoot: string;
  /** Port for `vite preview`. Default 4173. */
  port?: number;
}

export declare function createPlaywrightConfig(
  options: PlaywrightPresetOptions,
): PlaywrightTestConfig;
