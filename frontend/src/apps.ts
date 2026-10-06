import type { ComponentType } from 'react';
import { meta as danmaku } from './apps/danmaku/meta';
import { meta as dyhubGuide } from './apps/dyhub-guide/meta';
import { meta as giftPile } from './apps/gift-pile/meta';
import { meta as tetris } from './apps/tetris/meta';

export interface PageEntry {
  /** URL path, e.g. "/tetris". */
  path: string;
  title: string;
  description: string;
  /** Loads the page. Each package becomes its own chunk, fetched only on its route. */
  load: () => Promise<ComponentType>;
}

/** Interactive apps, in index order. To add one: a folder in apps/, its meta, and a line here. */
export const APPS: readonly PageEntry[] = [
  { ...tetris, load: () => import('./apps/tetris').then((m) => m.TetrisPage) },
  { ...danmaku, load: () => import('./apps/danmaku').then((m) => m.DanmakuPage) },
  { ...giftPile, load: () => import('./apps/gift-pile').then((m) => m.GiftPilePage) },
];

/** Tutorials and other reading pages, listed separately on the index. */
export const GUIDES: readonly PageEntry[] = [
  { ...dyhubGuide, load: () => import('./apps/dyhub-guide').then((m) => m.GuidePage) },
];

/** Every routed page. */
export const PAGES: readonly PageEntry[] = [...APPS, ...GUIDES];
