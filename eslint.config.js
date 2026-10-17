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
      // Claude Code's agent worktrees: whole copies of the repo.
      '.claude',
      '**/dist',
      '**/coverage',
      '**/playwright-report',
      '**/test-results',
      '**/storybook-static',
      // The chat bot's Python environment.
      '**/.venv',
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
      'chat-bot/tests/**/*.ts',
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

  // The chat bot's layers: core is pure logic, app the use cases, adapters the outside world
  // (DyHub, Claude CLI, files, processes). Only adapters and the entry touch the outside.
  {
    files: ['chat-bot/src/**/*.ts'],
    plugins: { 'import-x': importX },
    settings: {
      // Modules with other extensions are skipped, which no-cycle needs to follow imports.
      'import-x/extensions': ['.ts', '.js'],
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.ts', '.js'],
          tsconfig: { configFile: 'chat-bot/tsconfig.json' },
        }),
      ],
    },
    rules: {
      // No two modules import each other, directly or through others.
      'import-x/no-cycle': 'error',
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: 'chat-bot/src',
          zones: [
            {
              target: './core',
              from: ['./app', './adapters'],
              message: 'core is pure logic: it imports only core.',
            },
            {
              target: './app',
              from: './adapters',
              message: 'app reaches the outside world only through the interfaces in app/ports.ts.',
            },
            {
              target: ['./core', './app', './adapters'],
              from: './*.ts',
              message: 'Only the entry imports main.ts and cli-options.ts.',
            },
            {
              target: './adapters',
              from: './app',
              except: ['./ports.ts'],
              message: 'adapters implement app/ports.ts and never import the use cases.',
            },
            {
              target: './app/ports.ts',
              from: './app',
              message: 'ports.ts describes the outside world in core types only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['chat-bot/src/core/**/*.ts', 'chat-bot/src/app/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', '@dy-apps/services', 'winston'],
              message: 'Only adapters and main.ts talk to Node, DyHub and logging libraries.',
            },
          ],
        },
      ],
    },
  },

  // Last, so formatting is left entirely to Prettier.
  prettier,
);
