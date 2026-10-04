import { useEffect } from 'react';
import { Link } from 'react-router';
import { APPS } from './apps';

export function IndexPage() {
  useEffect(() => {
    document.title = 'dy-apps';
  }, []);

  return (
    <main>
      <h1>dy-apps</h1>
      <ul>
        {APPS.map((app) => (
          <li key={app.path}>
            <Link to={app.path}>{app.title}</Link> — {app.description}
          </li>
        ))}
      </ul>
    </main>
  );
}
