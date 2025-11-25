const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const importPlugin = require('eslint-plugin-import');
const promisePlugin = require('eslint-plugin-promise');

module.exports = tseslint.config(
  // Base configurations
  js.configs.recommended,
  ...tseslint.configs.recommended,
    
    // Global ignores
    {
        ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'artifacts/**', 'cache/**', 'deployments/**', 'eslint.config.js']
    },
    
  // Configuration for TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
      globals: {
        // Browser globals
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
                
        // Node globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
        global: 'readonly',
                
        // Test globals
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
                
        // Hardhat globals
        artifacts: 'readonly',
        contract: 'readonly',
        assert: 'readonly',
        web3: 'readonly',
        ethers: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'import': importPlugin,
      'promise': promisePlugin,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
            
      // Disable base rules that conflict with TypeScript versions
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': ['error', { builtinGlobals: true }],
            
      // Code style rules (migrated from your .eslintrc)
      'indent': ['error', 4, { SwitchCase: 1 }],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'space-before-function-paren': ['error', 'always'],
      'no-unused-expressions': 'off',
      'eqeqeq': ['error', 'smart'],
      'dot-notation': ['error', { allowKeywords: true, allowPattern: '' }],
      'no-trailing-spaces': ['error', { skipBlankLines: true }],
      'eol-last': 'warn',
      'comma-spacing': ['error', { before: false, after: true }],
      'camelcase': ['error', { properties: 'always' }],
      'no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
      'comma-dangle': ['warn', 'always-multiline'],
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-debugger': 'off',
      'no-undef': 'error',
      'object-curly-spacing': ['error', 'always'],
      'max-len': ['error', 200, 2],
      'generator-star-spacing': ['error', 'before'],
            
      // Promise plugin rules
      'promise/avoid-new': 'off',
      'promise/always-return': 'off',
      'promise/catch-or-return': 'error',
      'promise/no-native': 'off',
      'promise/param-names': 'error',
            
      // Import plugin rules
      'import/no-unresolved': 'off', // TypeScript handles this
      'import/named': 'off', // TypeScript handles this
      'import/namespace': 'off', // TypeScript handles this
      'import/default': 'off', // TypeScript handles this
      'import/export': 'error',
      'import/no-duplicates': 'error',
      'import/order': ['error', {
        'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'never',
      }],
    },
  },
    
  // Configuration for JavaScript files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        // Browser globals
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
                
        // Node globals
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
        global: 'readonly',
                
        // Test globals
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
                
        // Hardhat globals
        artifacts: 'readonly',
        contract: 'readonly',
        assert: 'readonly',
        web3: 'readonly',
        ethers: 'readonly',
      },
    },
    plugins: {
      'import': importPlugin,
      'promise': promisePlugin,
    },
    rules: {
      // Code style rules (migrated from your .eslintrc)
      'indent': ['error', 2, { SwitchCase: 1 }],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'space-before-function-paren': ['error', 'always'],
      'no-unused-expressions': 'off',
      'eqeqeq': ['error', 'smart'],
      'dot-notation': ['error', { allowKeywords: true, allowPattern: '' }],
      'no-trailing-spaces': ['error', { skipBlankLines: true }],
      'eol-last': 'warn',
      'comma-spacing': ['error', { before: false, after: true }],
      'camelcase': ['error', { properties: 'always' }],
      'no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
      'comma-dangle': ['warn', 'always-multiline'],
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-debugger': 'off',
      'no-undef': 'error',
      'object-curly-spacing': ['error', 'always'],
      'max-len': ['error', 200, 2],
      'generator-star-spacing': ['error', 'before'],
            
      // Promise plugin rules
      'promise/avoid-new': 'off',
      'promise/always-return': 'off',
      'promise/catch-or-return': 'error',
      'promise/no-native': 'off',
      'promise/param-names': 'error',
            
      // Import plugin rules
      'import/no-unresolved': 'off',
      'import/named': 'off',
      'import/namespace': 'off',
      'import/default': 'off',
      'import/export': 'error',
      'import/no-duplicates': 'error',
      'import/order': ['error', {
        'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'never',
      }],
    },
  },
    
  // Override for test files
  {
    files: ['test/**/*.ts', 'test/**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-unused-expressions': 'off',
    },
  },
);
