import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Shared TypeScript rules applied to both the frontend and the backend API.
// Kept in one place so the two config blocks below stay in sync.
const sharedTsRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  }],
  '@typescript-eslint/no-unused-expressions': 'error',
  '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
  'no-case-declarations': 'error',
}

export default tseslint.config(
  { ignores: ['dist', 'api/dist'] },

  // ── JS tooling files (scripts/, tailwind.config.js, postcss.config.mjs,
  //    eslint.config.js, etc.) ──────────────────────────────────────────
  // ts-eslint's recommended config only covers .ts/.tsx, so plain JS files
  // fell through to bare js.recommended with zero globals. These are all
  // Node-run tooling files.
  {
    extends: [js.configs.recommended],
    files: ['scripts/**/*.{js,mjs}', '*.config.js', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },

  // ── Service worker (public/sw.js) ─────────────────────────────────────
  // Runs in the service-worker execution context (self, clients, caches,
  // caches/fetch events) — not the window context.
  {
    extends: [js.configs.recommended],
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: globals.serviceworker,
    },
  },

  // ── Node-side root config files (vite.config.ts, vitest.config.ts) ────
  // These run in Node when Vite loads them (they use `path`, `__dirname`,
  // `process`), but they live at the repo root so they don't match the
  // `api/**` block. Without this they'd be linted as browser/React, which
  // hides Node globals and applies irrelevant React rules.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.nodeBuiltin },
    },
    rules: {
      ...sharedTsRules,
    },
  },

  // ── Frontend (browser + React) ────────────────────────────
  // Scoped to the app source only; `api/**` is handled by the Node block
  // below so browser globals and React rules don't leak into server code.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    // Exclude api (Node block below) and root Vite/vitest configs (Node
    // block above — those run in Node context, not the browser).
    ignores: ['api/**', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // ── Strict rules — all issues fixed ─────────────────────
      ...sharedTsRules,

      // React hooks
      'react-hooks/exhaustive-deps': 'error',
      // Package updates introduced React Compiler lint rules that are too strict
      // for the current codebase and block unrelated feature work.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'error',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },

  // ── Backend API (Node) ────────────────────────────────────
  // Node/Express + TypeScript. No React plugins; Node globals (process,
  // Buffer, __dirname, etc.) instead of browser globals.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['api/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...sharedTsRules,
    },
  },
)
