import { Link } from 'react-router';
import './index.css';

export function NotFoundPage() {
  return (
    <main className="plain">
      <h1>页面不存在</h1>
      <p>
        <Link to="/">返回首页</Link>
      </p>
    </main>
  );
}
