import rootConfig from '../../eslint.config.mjs';
import globals from 'globals';

export default [
  ...rootConfig,
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['drizzle.config.ts'],
    ...(rootConfig.find((config) => config.name === 'typescript-eslint/disable-type-checked') ||
      {}),
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: false,
      },
    },
  },
];
