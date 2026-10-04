import type { ComponentType } from 'react';
import { meta as danmaku } from '@dy-apps/danmaku/meta';
import { meta as tetris } from '@dy-apps/tetris/meta';

export interface AppEntry {
  /** URL path, e.g. "/tetris". */
  path: string;
  title: string;
  description: string;
  /** Loads the app's page. Each app becomes its own chunk, fetched only on its route. */
  load: () => Promise<ComponentType>;
}

/** Every app on the site, in index order. To add one: a package in apps/, its meta, and a line here. */
export const APPS: readonly AppEntry[] = [
  { ...tetris, load: () => import('@dy-apps/tetris').then((m) => m.TetrisPage) },
  { ...danmaku, load: () => import('@dy-apps/danmaku').then((m) => m.DanmakuPage) },
];
