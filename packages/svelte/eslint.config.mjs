import tsParser from "@typescript-eslint/parser";
import root from "../../eslint.config.mjs";

// Runes modules: the root config gives the Svelte parser its TypeScript parser for `.svelte` only.
export default [
  ...root,
  { files: ["**/*.svelte.ts"], languageOptions: { parserOptions: { parser: tsParser } } },
];
