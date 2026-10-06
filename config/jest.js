import { createRequire } from 'node:module';

// Resolve tooling from this package, so apps don't need to depend on it directly.
const require = createRequire(import.meta.url);

const swc = (tsx) => [
  require.resolve('@swc/jest'),
  {
    jsc: {
      parser: { syntax: 'typescript', tsx },
      transform: { react: { runtime: 'automatic' } },
      target: 'es2022',
    },
    module: { type: 'commonjs' },
  },
];

/**
 * jsdom + SWC preset. Tests live in `<rootDir>/tests` (Playwright's are in `integration-tests`); StyleX is
 * stubbed because only the bundler compiles it. `<rootDir>` is the directory of
 * the app's jest.config.js. `overrides` are merged shallowly.
 */
export function createJestConfig(overrides = {}) {
  return {
    testEnvironment: require.resolve('jest-environment-jsdom'),
    roots: ['<rootDir>/tests'],
    transform: {
      '^.+\\.ts$': swc(false),
      '^.+\\.tsx$': swc(true),
    },
    moduleNameMapper: {
      '^@stylexjs/stylex$': require.resolve('./jest/stylex-mock.cjs'),
      '\\.css$': require.resolve('identity-obj-proxy'),
    },
    collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/main.tsx', '!src/**/*.d.ts'],
    ...overrides,
  };
}
