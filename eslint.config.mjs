import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const config = [
  ...coreWebVitals,
  ...typescript,
  prettier,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'drizzle/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    /*
     * Core rule 7 guard. We moved off Supabase, so Postgres no longer enforces row-level
     * security — the data-access layer does. That only works with zero exceptions, so
     * the raw Drizzle client is unreachable from anywhere but /lib/db.
     */
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'inngest/**/*.ts', 'lib/**/*.ts'],
    ignores: ['lib/db/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/db/client',
                '**/db/client',
                'drizzle-orm/*',
                '@neondatabase/serverless',
              ],
              message:
                'Do not touch the database directly. Add a query to /lib/db/queries and import it from @/lib/db.',
            },
          ],
        },
      ],
    },
  },
  {
    // /lib is framework-free domain logic. It must not import React or Next.
    files: ['lib/**/*.ts'],
    ignores: ['lib/db/**', 'lib/auth/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: '/lib is framework-free. Keep React out of domain logic.' },
            { name: 'next', message: '/lib is framework-free. Keep Next.js out of domain logic.' },
          ],
          patterns: [
            {
              group: ['next/*', 'react-dom*', '@/components/*', '@/app/*'],
              message: '/lib is framework-free. Domain logic must not depend on the UI layer.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
