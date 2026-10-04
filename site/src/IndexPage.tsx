import { useEffect } from 'react';
import { Link } from 'react-router';
import { APPS, GUIDES, type PageEntry } from './apps';
import { SHORT_COMMIT_HASH } from './build';
import './index.css';

export function IndexPage() {
  useEffect(() => {
    document.title = 'dy-apps';
  }, []);

  return (
    <main className="plain">
      <h1>dy-apps</h1>
      <PageList title="应用" pages={APPS} />
      <PageList title="教程" pages={GUIDES} />
      <p className="plain__footer">构建版本 {SHORT_COMMIT_HASH}</p>
    </main>
  );
}

function PageList({ title, pages }: { title: string; pages: readonly PageEntry[] }) {
  return (
    <section>
      <h2>{title}</h2>
      <ul>
        {pages.map((page) => (
          <li key={page.path}>
            <Link to={page.path}>{page.title}</Link> — {page.description}
          </li>
        ))}
      </ul>
    </section>
  );
}
