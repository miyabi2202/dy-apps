import { createRequire } from 'node:module';
import { jestAliases } from './aliases.js';

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
 * jsdom + SWC. Unit tests live in each library's and app's `tests/`; Playwright's specs are in
 * `integration-tests/`. StyleX is stubbed because only the bundler compiles it.
 */
export default {
  rootDir: '..',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/tests/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/config/jest/setup-tests.ts'],
  transform: {
    '^.+\\.ts$': swc(false),
    '^.+\\.tsx$': swc(true),
  },
  moduleNameMapper: {
    ...jestAliases,
    '^@stylexjs/stylex$': '<rootDir>/config/jest/stylex-mock.cjs',
    '\\.css$': 'identity-obj-proxy',
    '\\.png$': 'identity-obj-proxy',
  },
  collectCoverageFrom: [
    'src/{apps,services,ui}/**/*.{ts,tsx}',
    '!**/{tests,integration-tests,stories}/**',
    '!**/*.d.ts',
  ],
};
