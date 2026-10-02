import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  // 1. Global Ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/.react-router/**",
      "**/.turbo/**",
      "**/.tmp/**",
      "**/.eslintcache/**",
      "**/.prettiercache/**",
      "pnpm-lock.yaml",
      "s3-bucket/**",
      "**/s3-bucket/**",
      "scratch/**",
      "**/scratch/**",
    ],
  },

  // 2. Base Configuration for all TypeScript and JavaScript files
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    ...eslint.configs.recommended,
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // Side effect imports (e.g. css polyfills)
            ["^\\u0000"],
            // Node.js built-ins
            ["^node:"],
            // Monorepo internal workspace packages (MUST precede generic scoped packages)
            ["^@veolms(/.*|$)"],
            // External third-party packages
            ["^@?\\w"],
            // Internal path aliases
            ["^@/"],
            // Relative parent imports
            ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
            // Relative sibling/current imports
            ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
            // Style imports
            ["^.+\\.s?css$"],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
      "no-unused-vars": "off", // Handled by @typescript-eslint
    },
  },

  // 3. TypeScript Rules (Non-Type-Aware Base)
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  // 4. Browser / Frontend Applications (apps/web & packages/video-player)
  {
    files: [
      "apps/web/**/*.{ts,tsx}",
      "packages/video-player/**/*.{ts,tsx}",
      "packages/web-core/**/*.{ts,tsx}",
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Scoped Tech Debt: React 19 Compiler readiness rules disabled temporarily
      // for legacy media engines and imperative hooks. Tracking ticket: TECHDEBT-REACT19-COMPILER
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
    settings: {
      react: { version: "19.2" },
    },
  },

  // 5. Backend Applications & Node.js Packages (apps/api, database, storage, config, core)
  {
    files: [
      "apps/api/**/*.{ts,js}",
      "packages/database/**/*.{ts,js}",
      "packages/storage/**/*.{ts,js}",
      "packages/config/**/*.{ts,js}",
      "packages/api-core/**/*.{ts,js}",
      "scripts/**/*.mjs",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // 6. Expanded Type-Aware Linting for All Backend / Data Packages
  {
    files: [
      "apps/api/src/**/*.ts",
      "packages/database/src/**/*.ts",
      "packages/database/scripts/**/*.ts",
      "packages/storage/src/**/*.ts",
      "packages/api-core/src/**/*.ts",
      "packages/config/src/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "no-console": "error",
    },
  },

  // 7. CLI, Database Seeder, and Config Security Pre-boot Console Overrides
  {
    files: [
      "apps/api/src/cli/**/*.ts",
      "packages/database/src/seed*.ts",
      "packages/database/scripts/**/*.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["packages/config/src/**/*.ts"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // 8. Prettier Override (MUST be last to disable conflicting formatting rules)
  eslintConfigPrettier,
];
