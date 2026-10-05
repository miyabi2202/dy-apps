import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { PAGES } from './apps';
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
