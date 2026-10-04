import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { APPS } from './apps';
import { IndexPage } from './IndexPage';
import { NotFoundPage } from './NotFoundPage';
import './global.css';

const router = createBrowserRouter([
  { path: '/', Component: IndexPage },
  ...APPS.map((app) => ({
    path: app.path,
    // Route-level lazy loading: the app's code is fetched only when its path is visited.
    lazy: async () => ({ Component: await app.load() }),
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
