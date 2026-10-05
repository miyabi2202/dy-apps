import { colors, fontSize } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { Link } from 'react-router';
import { Shell } from './shell';

export function NotFoundPage() {
  return (
    <Shell>
      <h1 {...stylex.props(styles.title)}>页面不存在</h1>
      <p {...stylex.props(styles.back)}>
        <Link to="/" {...stylex.props(styles.link)}>
          返回首页
        </Link>
      </p>
    </Shell>
  );
}

const styles = stylex.create({
  title: { margin: 0 },
  back: { margin: 0 },
  link: {
    color: colors.accent,
    fontSize: fontSize.lg,
    outlineColor: colors.accent,
  },
});
