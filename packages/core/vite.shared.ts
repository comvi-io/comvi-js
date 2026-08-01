/**
 * Shared pieces of the multi-entry @comvi/core build (prod / dev / UMD).
 *
 * Entries:
 * - index → the full root entry (ICU + ambient tag registration)
 * - slim  → simple {param} compiler only
 * - icu   → pure icuCompiler subpath
 * - tags  → tag toolbox + ambient registration
 *
 * src/register-tags.ts (the shared registration side-effect module imported
 * bare by index AND tags) is pinned into its OWN chunk with a DETERMINISTIC
 * (hash-free) file name: the package.json `sideEffects` array lists it by
 * exact path, and a hash-named shared chunk would let that array drift per
 * build (plan R2). Only the module containing the top-level call needs the
 * listing — its dependencies are retained through used-export edges.
 */
import { resolve } from "path";
import type { Plugin } from "vite";
import { minify } from "terser";

export const coreEntries = (dir: string): Record<string, string> => ({
  index: resolve(dir, "src/index.ts"),
  slim: resolve(dir, "src/slim.ts"),
  icu: resolve(dir, "src/icu.ts"),
  tags: resolve(dir, "src/tags.ts"),
  "editor-bridge": resolve(dir, "src/editor-bridge.ts"),
});

/** Internal chunk name for the pinned registration module. */
export const REGISTER_CHUNK = "register-tags";

/**
 * Pin src/register-tags.ts (and nothing else — recursive dependency capture
 * would drag shared pipeline modules into the side-effectful chunk, which
 * would execute the registration for /slim consumers) into its own chunk.
 */
export const coreCodeSplitting = {
  includeDependenciesRecursively: false,
  groups: [
    {
      name: REGISTER_CHUNK,
      test: /src[\\/]register-tags\.ts/,
      minSize: 0,
      minShareCount: 1,
      priority: 10,
    },
  ],
};

/**
 * Keeps the top-level `registerTagSyntax()` call alive in our own dist:
 * with the blanket `moduleSideEffects: false` below, rolldown would drop the
 * bare-imported registration module entirely. (The config-level
 * ModuleSideEffectsRule/function forms are not honored by the current
 * rolldown-vite RC, so this is pinned at the plugin-hook level.)
 * The consumer-facing guarantee is the package.json `sideEffects` array.
 */
export const keepRegisterSideEffect: Plugin = {
  name: "comvi:keep-register-tags-side-effect",
  transform(code, id) {
    if (/src[\\/]register-tags\.ts/.test(id)) {
      return { code, map: null, moduleSideEffects: "no-treeshake" };
    }
  },
};

/**
 * Mangle `_`-prefixed (soft-private) property names in the emitted prod
 * artifacts. These members were hard `#`-privates until the 0.5.0 weight
 * pass; TS `private` keeps them compile-time-private, and this plugin keeps
 * them out of the shipped bytes — consumers' bundlers can never mangle
 * properties themselves. `__`-prefixed names (`__COMVI__`, `__v_isVNode`)
 * do NOT match the regex. One nameCache per plugin instance keeps renames
 * consistent across every chunk of a build.
 */
export const mangleInternalProps = (): Plugin => {
  const nameCache = {};
  return {
    name: "comvi:mangle-internal-props",
    async renderChunk(code) {
      const result = await minify(code, {
        // Default compression (2 passes): consumers' bundlers minify again
        // anyway, but terser folds dead prod branches and unused arguments
        // that esbuild-class minifiers leave behind.
        compress: { passes: 2 },
        module: true,
        mangle: { properties: { regex: /^_[a-zA-Z]/ } },
        nameCache,
        format: { preserve_annotations: true, comments: false },
      });
      return result.code ? { code: result.code, map: null } : null;
    },
  };
};

export const coreTreeshake = {
  moduleSideEffects: false,
  propertyReadSideEffects: false as const,
};

/** Deterministic entry file name; `suffix` is "" (prod) or ".dev". */
export const entryFileName = (name: string, suffix: string): string =>
  name === "index" ? `comvi-core${suffix}.js` : `comvi-core-${name}${suffix}.js`;

/**
 * Chunk file names: the registration chunk is hash-free (sideEffects
 * contract), everything else stays content-hashed.
 */
export const chunkFileName = (name: string, suffix: string): string =>
  name === REGISTER_CHUNK
    ? `chunks/comvi-core-register-tags${suffix}.js`
    : `chunks/comvi-core-[name]-[hash]${suffix}.js`;
