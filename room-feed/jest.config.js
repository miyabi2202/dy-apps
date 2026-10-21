import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Node + SWC. */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      require.resolve('@swc/jest'),
      {
        jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
        module: { type: 'commonjs' },
      },
    ],
  },
};
