/**
 * Stand-in for the file `comvi typegen` writes.
 *
 * Twelve site fences (Nuxt projects put it at the root, Vite ones under `src/`, so it exists at both) open with `import './types/i18n';` and then never show the
 * file, because the point of the line is that the CLI generated it. Without a
 * stub, every one of those fences fails on the import instead of on its own code.
 *
 * DELIBERATELY EMPTY. The real generated file augments `TranslationKeys`, and
 * core derives `PermissiveKey = keyof TranslationKeys extends never ? string
 * : never` from it — so a fixture that augmented anything would turn `t(key)`
 * into an error on every page that imports it, which is the corpus-poisoning
 * this lot exists to prevent, merely moved into the fixture layer. A page that
 * wants the augmented world writes the `declare module` fence itself, and then
 * it owns the consequences inside its own program.
 */
export {};
