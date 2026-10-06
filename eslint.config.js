import js from '@eslint/js';
import react from '@eslint-react/eslint-plugin';
import stylex from '@stylexjs/eslint-plugin';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { createNodeResolver, importX } from 'eslint-plugin-import-x';
import { readdirSync } from 'node:fs';
import tseslint from 'typescript-eslint';

const REACT_FILES = [
  'frontend/src/*.{ts,tsx}',
  'frontend/src/apps/**/*.{ts,tsx}',
  'frontend/src/ui/**/*.{ts,tsx}',
];
/** Tests aren't app code: no React or StyleX rules there. */
const TEST_FILES = ['**/tests/**', '**/integration-tests/**'];
const APPS = readdirSync(new URL('frontend/src/apps', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** The site's own files: those directly in frontend/src, beside the apps and libraries. */
const SITE_FILES = ['./*.ts', './*.tsx', './*.css'];

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
    files: REACT_FILES,
    ignores: TEST_FILES,
    ...react.configs['recommended-type-checked'],
  },
  {
    files: REACT_FILES,
    ignores: TEST_FILES,
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
      'frontend/src/apps/*/tests/**/*.{ts,tsx}',
      'frontend/config/jest/*.ts',
      'frontend/src/services/tests/**/*.ts',
      'frontend/src/ui/tests/**/*.{ts,tsx}',
    ],
    languageOptions: { globals: globals.jest },
  },

  // What may import what in frontend/: apps never import each other or the site, and the
  // shared libraries import neither (services not even ui). See AGENTS.md.
  {
    files: ['frontend/**/*.{ts,tsx}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.ts', '.tsx', '.js'],
          tsconfig: { configFile: 'frontend/tsconfig.json' },
        }),
      ],
    },
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: 'frontend/src',
          zones: [
            ...APPS.map((app) => ({
              target: `./apps/${app}`,
              from: './apps',
              except: [`./${app}`],
              message: 'Apps never import from each other. Put shared code in ui or services.',
            })),
            { target: './apps', from: SITE_FILES, message: 'Apps never import the site.' },
            {
              target: ['./ui', './services'],
              from: './apps',
              message: 'Shared libraries never import an app.',
            },
            {
              target: ['./ui', './services'],
              from: SITE_FILES,
              message: 'Shared libraries never import the site.',
            },
            { target: './services', from: './ui', message: 'services is non-UI code.' },
          ],
        },
      ],
    },
  },

  // Last, so formatting is left entirely to Prettier.
  prettier,
);
