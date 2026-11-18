import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      'apps/**',
      'bench/.private/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // REQ-1.2: ghost-core only sees the Driver interface, never DOM, Next or Playwright.
    files: ['packages/ghost-core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['next', 'next/*'], message: 'ghost-core must not import Next.js.' },
            { group: ['react', 'react-dom', 'react-dom/*'], message: 'ghost-core must not import React.' },
            { group: ['playwright', 'playwright-core', '@playwright/*'], message: 'ghost-core must not import Playwright.' },
            { group: ['jsdom'], message: 'ghost-core must not import a DOM implementation.' },
          ],
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
