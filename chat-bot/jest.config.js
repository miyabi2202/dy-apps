import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Prompts show clock times; keep them the same on every machine.
process.env.TZ = 'UTC';

/** Node + SWC, with `@dy-apps/services` read from the site's source like tsconfig.json does. */
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
  moduleNameMapper: {
    '^@dy-apps/services$': '<rootDir>/../frontend/src/services/index.ts',
  },
};
