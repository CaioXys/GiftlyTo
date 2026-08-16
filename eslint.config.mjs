import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    ignores: [
      'node_modules/',
      'dist/',
      'src/admin-panel/dist/',
      'src/public/qrcode.js',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { js },
    extends: ['js/recommended'],
  },
  {
    files: ['src/public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        google: 'readonly',
        qrcode: 'readonly',
      },
    },
  },
  tseslint.configs.recommended,
  {
    files: ['prisma/**/*.js', 'src/db/**/*.js'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  eslintConfigPrettier,
])
