import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <main {...stylex.props(styles.main)}>
      <h1 {...stylex.props(styles.title)}>Tetris</h1>
      <button type="button" {...stylex.props(styles.button)} onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>
    </main>
  );
}

const styles = stylex.create({
  main: {
    gap: 16,
    alignItems: 'center',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  title: {
    margin: 0,
    fontSize: 48,
  },
  button: {
    borderRadius: 8,
    borderStyle: 'none',
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: {
      default: '#38bdf8',
      ':hover': '#7dd3fc',
    },
    color: '#0f172a',
    cursor: 'pointer',
    fontSize: 18,
  },
});
