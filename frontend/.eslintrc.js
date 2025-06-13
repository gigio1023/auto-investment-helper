module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
    ecmaVersion: 2022,
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'react-app',
    'react-app/jest',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    browser: true,
    es2022: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'build/', 'node_modules/'],
  rules: {
    // Prettier
    'prettier/prettier': 'error',
    
    // 변수 관련
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_'
    }],
    
    // 코드 품질
    'no-console': 'warn',
    'prefer-const': 'error',
    
    // TypeScript 특화 규칙
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    '@typescript-eslint/no-empty-function': 'warn',
    
    // React 관련
    'react/prop-types': 'off', // TypeScript가 이미 체크하므로
    'react/react-in-jsx-scope': 'off', // React 17+에서는 불필요
    'react-hooks/exhaustive-deps': 'warn',
    
    // Testing Library 규칙 완화
    'testing-library/no-node-access': 'warn',
    'testing-library/no-wait-for-multiple-assertions': 'warn',
    'testing-library/no-wait-for-side-effects': 'warn',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  overrides: [
    {
      files: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx', '**/__tests__/**/*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        'no-console': 'off',
        'testing-library/no-node-access': 'off',
        'testing-library/no-wait-for-multiple-assertions': 'off',
        'testing-library/no-wait-for-side-effects': 'off',
      },
    },
  ],
}; 