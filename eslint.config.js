// Lint do Vetra: só regras que pegam erro de verdade (nome inexistente, chave duplicada, código morto…).
// Estilo não é verificado. Os arquivos de js/ são scripts clássicos que se falam pelo objeto global App.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser, App: 'writable', pdfjsLib: 'readonly', PDFLib: 'readonly', leitor: 'writable' },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',          // muito ruído em código de interface; não é erro de comportamento
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',       // estilo de regex, não muda o comportamento
      'no-control-regex': 'off',        // usado de propósito para limpar texto de PDF
    },
  },
  {
    files: ['sw.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.serviceworker } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': 'off', 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
];
