// .eslintrc.cjs
module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    plugins: ['@typescript-eslint', 'prettier'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:prettier/recommended', // 整合 Prettier
    ],
    rules: {
      'prettier/prettier': 'error',
      // 你可以加入其他自訂規則，例如：
      // "@typescript-eslint/no-unused-vars": "warn"
    },
  };