import type { ComponentType } from 'react';
import { meta as danmaku } from '@dy-apps/danmaku/meta';
import { meta as dyhubGuide } from '@dy-apps/dyhub-guide/meta';
import { meta as tetris } from '@dy-apps/tetris/meta';

export interface PageEntry {
  /** URL path, e.g. "/tetris". */
  path: string;
  title: string;
  description: string;
  /** Loads the page. Each package becomes its own chunk, fetched only on its route. */
  load: () => Promise<ComponentType>;
}

/** Interactive apps, in index order. To add one: a package in apps/, its meta, and a line here. */
export const APPS: readonly PageEntry[] = [
  { ...tetris, load: () => import('@dy-apps/tetris').then((m) => m.TetrisPage) },
  { ...danmaku, load: () => import('@dy-apps/danmaku').then((m) => m.DanmakuPage) },
];

/** Tutorials and other reading pages, listed separately on the index. */
export const GUIDES: readonly PageEntry[] = [
  { ...dyhubGuide, load: () => import('@dy-apps/dyhub-guide').then((m) => m.GuidePage) },
];

/** Every routed page. */
export const PAGES: readonly PageEntry[] = [...APPS, ...GUIDES];
