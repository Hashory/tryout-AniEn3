import rootConfig from '../../eslint.config.mjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  ...rootConfig,
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['drizzle.config.ts'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: false,
      },
    },
  },
];
