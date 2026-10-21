import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, redirect } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { PAGES } from './apps';
import { ROOM_FEED_GUIDE_PATH } from '@dy-apps/services';
import { IndexPage } from './index-page';
import { NotFoundPage } from './not-found-page';
import './global.css';

const router = createBrowserRouter([
  { path: '/', Component: IndexPage },
  ...PAGES.map((page) => ({
    path: page.path,
    // Route-level lazy loading: the page's code is fetched only when its path is visited.
    lazy: async () => ({ Component: await page.load() }),
  })),
  // The guide's old address, from when room-feed was DyHub, so links already shared still work.
  { path: '/dyhub-windows', loader: () => redirect(ROOM_FEED_GUIDE_PATH) },
  { path: '*', Component: NotFoundPage },
]);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
