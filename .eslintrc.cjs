/** @type {import("eslint").Linter.Config} */

// Phase toggles (sans changer le fichier) :
// - ESLINT_STRICT=1       => certains "warn" passent en "error" (Phase 1+)
// - ESLINT_TYPE_AWARE=1   => active parserOptions.project (plus lent, mais règles TS avancées)
// Exemples :
//   $env:ESLINT_STRICT="1"; $env:ESLINT_TYPE_AWARE="1"; npx eslint ...

const isStrict = process.env.ESLINT_STRICT === '1';
const isTypeAware = process.env.ESLINT_TYPE_AWARE === '1';

const sev = (base /* "warn"|"error" */) => (isStrict ? 'error' : base);

module.exports = {
  root: true,

  env: {
    browser: true,
    node: true,
    es2022: true,
  },

  parser: '@typescript-eslint/parser',

  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    // Type-aware uniquement si demandé (perf Phase 0)
    ...(isTypeAware
      ? {
          tsconfigRootDir: __dirname,
          project: ['./tsconfig.eslint.json'],
        }
      : {}),
  },

  settings: {
    react: { version: 'detect' },
  },

  plugins: ['@typescript-eslint', 'react', 'react-hooks'],

  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],

  // Important: ignorePatterns ESLint (complète .gitignore + MegaLinter)
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    'audit/',
    'megalinter-reports/',
    '.megalinter-reports/',
    '.cache/',
    '*.min.*',

    // D.TS générés / suspects (ne pas lint)
    'vite.config.d.ts',
    'vitest.config.d.ts',
    '**/*.generated.d.ts',
    '**/*.d.ts.map',
  ],

  rules: {
    // React 17+ / Vite: pas besoin d'import React
    'react/react-in-jsx-scope': 'off',

    // “Qualité” utile même en Phase 0 (en warn par défaut)
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    '@typescript-eslint/ban-ts-comment': sev('warn'),
    '@typescript-eslint/no-non-null-assertion': sev('warn'),
    '@typescript-eslint/no-explicit-any': sev('warn'),

    // Règles type-aware (activées seulement si ESLINT_TYPE_AWARE=1)
    '@typescript-eslint/no-misused-promises': isTypeAware ? sev('warn') : 'off',
    '@typescript-eslint/no-floating-promises': isTypeAware
      ? sev('warn')
      : 'off',
    '@typescript-eslint/await-thenable': isTypeAware ? sev('warn') : 'off',

    // Hooks : déjà couvert par l'extend, on garde
  },

  overrides: [
    /**
     * 1) Phase 0: couper le BRUIT de formatting (tu corrigeras plus tard via Prettier/ESLint fix)
     *    => on neutralise uniquement les règles “style”
     */
    {
      files: ['**/*.{ts,tsx,js,jsx}'],
      excludedFiles: [
        '**/*.d.ts',
        'vite.config.d.ts',
        'vitest.config.d.ts',
        '**/*.generated.d.ts',
      ],
      rules: {
        // TS plugin style rules
        '@typescript-eslint/semi': 'off',
        '@typescript-eslint/quotes': 'off',
        '@typescript-eslint/space-before-function-paren': 'off',
        '@typescript-eslint/comma-dangle': 'off',
        '@typescript-eslint/indent': 'off',
        '@typescript-eslint/member-delimiter-style': 'off',

        // Core style rules (au cas où elles apparaissent via d'autres configs)
        semi: 'off',
        quotes: 'off',
        'comma-dangle': 'off',
        indent: 'off',
        'no-multi-spaces': 'off',
        'multiline-ternary': 'off',
        'padded-blocks': 'off',
        'no-trailing-spaces': 'off',
      },
    },

    /**
     * 2) Scripts Node (si tu veux des règles spécifiques plus tard)
     */
    {
      files: ['scripts/**/*.{ts,js}'],
      env: { node: true, browser: false },
    },
  ],
};
