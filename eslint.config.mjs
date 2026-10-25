import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', '.husky/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    // 关键路径 type-aware 收敛: 仅通信引擎 / HTTP / 鉴权启用带类型的规则,
    // 类型后端为 TypeScript 6 ( 见 package.json 的 typescript 别名 ),
    // 待 typescript-eslint 支持 TS >= 7.1 后整体收编到单一后端。
    files: ['src/features/messaging/**/*.{ts,tsx}', 'src/features/user-auth/**/*.{ts,tsx}', 'src/shared/api/**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'warn'
    }
  },
  {
    files: ['electron/**/*.ts', 'scripts/**/*.mjs', '*.config.ts', '*.config.mjs'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  prettier
)
