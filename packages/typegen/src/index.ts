/**
 * @comvi/typegen — the generator of 0.8 typed translations (design rev 3 §3.8, R3-18):
 * the wire schema v2, the one `Catalogs` emitter, and the Node API `generate()` /
 * `watch()` that `comvi typegen`, `@comvi/vite-plugin`, the Nuxt module and
 * `withComvi({ types })` of `@comvi/next` wrap. One emitter, so every wrapper writes the
 * same bytes for the same catalogs.
 *
 * Workspace-private: each wrapper inlines this package at build time.
 */
export {
  AUGMENTABLE_MODULES,
  chooseAugmentationTarget,
  isModuleSpecifier,
  resolveAugmentationTarget,
  type AppManifest,
} from "./augment";

export * from "./v2";
