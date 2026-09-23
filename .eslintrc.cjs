module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked'
  ],
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname
  },
  parser: 'vue-eslint-parser',
  rules: {
    // 核心：禁止业务代码直接调用 localStorage / sessionStorage（TR-1.2 / AC-4）
    // 只允许 src/storage/* 直接使用（在该目录下的文件里单行 eslint-disable 禁用）
    'no-restricted-globals': [
      'error',
      {
        name: 'localStorage',
        message:
          '禁止直接使用 localStorage；请通过 src/storage/index.ts 的 storage API（避免散落 25+ key 与命名冲突）。如果确实在 storage 层内部使用，请 // eslint-disable-next-line no-restricted-globals 单行禁用并加注释。'
      },
      {
        name: 'sessionStorage',
        message: '禁止直接使用 sessionStorage；走 storage API 统一管理。'
      }
    ],
    // 允许 TS _ 前缀未使用变量（用于占位参数）
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
    ],
    // Vue 模板中允许 v-html（博客 markdown 渲染需要）
    'vue/no-v-html': 'off',
    // 不需要 prop types 运行时验证（有 TS 编译期）
    'vue/require-default-prop': 'off',
    'vue/require-prop-types': 'off',
    // strict-type-checked 中对「外部无 schema 数据」过度严格的规则 → 降级为 WARN
    // （localStorage JSON.parse、radio-browser.info 原始响应、CDN 注入 PDF 三库全局对象均无运行时类型）
    '@typescript-eslint/restrict-template-expressions': 'warn',
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unnecessary-condition': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    '@typescript-eslint/unified-signatures': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-redundant-type-constituents': 'warn',
    '@typescript-eslint/no-misused-promises': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn'
  },
  ignorePatterns: [
    'dist',
    '_legacy',
    '_site',
    'node_modules',
    'coverage',
    'playwright-report',
    '*.config.js'
  ],
  overrides: [
    {
      files: ['src/storage/**/*.ts'],
      rules: {
        'no-restricted-globals': 'off'
      }
    },
    {
      files: ['src/**/*.vue'],
      rules: {
        '@typescript-eslint/no-floating-promises': 'off'
      }
    }
  ]
}
