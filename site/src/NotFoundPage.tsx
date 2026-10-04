import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main>
      <h1>页面不存在</h1>
      <p>
        <Link to="/">返回首页</Link>
      </p>
    </main>
  );
}
