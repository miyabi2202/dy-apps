import js from '@eslint/js';
import react from '@eslint-react/eslint-plugin';
import stylex from '@stylexjs/eslint-plugin';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// One flat config for the whole monorepo. Each package's tsconfig.json is
// found automatically by the project service.
export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/coverage',
      '**/playwright-report',
      '**/test-results',
      '**/storybook-static',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  { files: ['**/*.{js,cjs}'], ...tseslint.configs.disableTypeChecked },

  // React + StyleX: the site and every app
  {
    files: ['site/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}', 'ui/src/**/*.{ts,tsx}'],
    ...react.configs['recommended-type-checked'],
  },
  {
    files: ['site/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}', 'ui/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      '@stylexjs': stylex,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@stylexjs/valid-styles': 'error',
      '@stylexjs/no-unused': 'error',
      '@stylexjs/sort-keys': 'warn',
    },
  },
  {
    files: [
      'apps/*/tests/**/*.{ts,tsx}',
      'apps/*/src/setup-tests.ts',
      'dyhub-client/tests/**/*.ts',
      'local-storage/tests/**/*.ts',
      'ui/tests/**/*.{ts,tsx}',
    ],
    languageOptions: { globals: globals.jest },
  },

  // Last, so formatting is left entirely to Prettier.
  prettier,
);
