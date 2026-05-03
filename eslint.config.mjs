import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import sveltePlugin from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import vuePlugin from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import globals from "globals";

const commonGlobals = {
  ...globals.es2024,
  ...globals.browser,
  ...globals.node,
};

const testGlobals = {
  ...globals.vitest,
  ...globals.node,
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-analyze/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/.next/**",
      "**/.nuxt/**",
      "**/.output/**",
      "**/.svelte-kit/**",
      "**/playwright-report/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"],
  ...vuePlugin.configs["flat/recommended"],
  ...sveltePlugin.configs["flat/recommended"],
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: commonGlobals,
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: "latest",
        sourceType: "module",
        extraFileExtensions: [".vue"],
      },
      globals: commonGlobals,
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
      },
      globals: commonGlobals,
    },
  },
  {
    files: [
      "**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
      "**/tests/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
      "**/__tests__/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
    ],
    languageOptions: {
      globals: testGlobals,
    },
  },
  {
    files: ["**/*.{ts,mts,cts,tsx,vue}"],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Disable stylistic rules that conflict with Prettier formatting.
  eslintConfigPrettier,
  {
    rules: {
      "preserve-caught-error": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "vue/multi-word-component-names": "off",
      "vue/one-component-per-file": "off",
      "vue/require-default-prop": "off",
      "svelte/no-at-html-tags": "off",
    },
  },
];
