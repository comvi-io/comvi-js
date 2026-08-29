/**
 * Shared pieces of the multi-entry @comvi/core build (prod / dev / UMD).
 *
 * Entries (see `coreEntries` below — that list is the authority):
 * - index          → the BASE host: simple {param} compiler, no ambient tags
 * - icu            → pure icuCompiler subpath
 * - rich-text      → PURE `<T>` pipeline + VirtualNode toolbox, no registration
 * - tags           → rich-text re-exported + ambient registration
 * - loader/plugins/devtools/editor-bridge → the capability subpaths
 *
 * The CDN global (`src/umd.ts`, built by `vite.config.umd.ts`) is the one
 * composed entry left, and it is not an ESM package entry.
 *
 * src/register-tags.ts (the shared registration side-effect module) is pinned
 * into its OWN chunk with a DETERMINISTIC (hash-free) file name: the
 * package.json `sideEffects` array lists it by exact path, and a hash-named
 * shared chunk would let that array drift per build (plan R2). ONLY the module
 * containing the top-level call is in that chunk and in that array — its
 * dependencies, the tag grammar included, are retained through used-export
 * edges and stay PURE and hash-named, which is what lets `@comvi/core/rich-text`
 * reach the grammar without dragging the registration in. Since the
 * single-entry convergence the ESM root no longer imports it bare; `tags` and
 * the UMD entry do.
 */
import { resolve } from "path";
import type { Plugin } from "vite";
import { minify } from "terser";

/**
 * Every core subpath entry MUST be listed here. The prod build is ONE vite
 * invocation, which is the only reason `mangleInternalProps`'s single terser
 * nameCache renames `_`-prefixed members consistently across chunks — the
 * cross-module state + hook contract in `core/i18n.ts#I18nInternal` depends
 * on it. Never build a core subpath through a separate config.
 */
export const coreEntries = (dir: string): Record<string, string> => ({
  index: resolve(dir, "src/index.ts"),
  // `src/umd.ts` is deliberately absent: the CDN global is a separate
  // invocation (`vite.config.umd.ts`) and is not an ESM package entry.
  icu: resolve(dir, "src/icu.ts"),
  "rich-text": resolve(dir, "src/rich-text.ts"),
  tags: resolve(dir, "src/tags.ts"),
  loader: resolve(dir, "src/loader.ts"),
  plugins: resolve(dir, "src/plugins.ts"),
  devtools: resolve(dir, "src/devtools.ts"),
  "editor-bridge": resolve(dir, "src/editor-bridge.ts"),
});

/** Internal chunk name for the pinned registration module. */
export const REGISTER_CHUNK = "register-tags";

/** Internal chunk name for the pure tag grammar the registration installs. */
export const TAG_SYNTAX_CHUNK = "tag-syntax";

/**
 * Pin `src/register-tags.ts` — and NOTHING else — into the side-effectful
 * chunk, and the tag grammar it registers (`src/core/translate/tags.ts`) into
 * a separate PURE one. Recursive dependency capture stays off: it would drag
 * shared pipeline modules into the side-effectful chunk and execute the
 * registration for base-entry consumers.
 *
 * The grammar has to be its own chunk because two entries reach it now and
 * only one of them may register: `@comvi/core/rich-text` imports
 * `tagSyntaxExtension` (through `core/prepareTranslation`) to pass per call,
 * while `@comvi/core/tags` additionally bare-imports `register-tags`. Folding
 * the grammar in with the registration call — which is what this group did
 * while `/tags` was its only reachable entry — would make importing the pure
 * seam execute `registerTagSyntax()`, i.e. exactly the ambient side effect the
 * seam exists to avoid.
 *
 * It also keeps the TDZ cycle away. With one reachable entry rolldown folded
 * the grammar INTO the entry chunk, which the pinned registration chunk
 * imports back: `comvi-core-tags.js` → register chunk → `comvi-core-tags.js`,
 * a cycle whose TDZ makes `registerTagSyntax()` see an uninitialized
 * `tagSyntaxExtension` and throw at import time. A named group for the grammar
 * removes the cycle by construction and does not depend on how many entries
 * happen to reach it. The extra dist chunk boundary is free once an app
 * bundler re-bundles through the exports map: the landed full-composite row
 * stayed 23957 B min and moved 8604 → 8603 B min+gz.
 *
 * Only graphs that opt into tags load the registration chunk; only graphs that
 * render rich text or opt into tags load the grammar chunk.
 */
export const coreCodeSplitting = {
  includeDependenciesRecursively: false,
  groups: [
    {
      name: REGISTER_CHUNK,
      test: /src[\\/]register-tags\.ts/,
      minSize: 0,
      minShareCount: 1,
      priority: 20,
    },
    {
      name: TAG_SYNTAX_CHUNK,
      test: /src[\\/]core[\\/]translate[\\/]tags\.ts/,
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

/** Internal (soft-private) property names — the only ones we rename. */
const INTERNAL_PROP = /^_[a-zA-Z]/;

/**
 * Every PROPERTY POSITION in emitted JS, so a public name can never be handed
 * out as a mangled internal (see the plugin doc below). Deliberately
 * over-matching: a false positive only removes one candidate from the
 * mangler's name pool, a miss is a production crash.
 */
const PROPERTY_POSITIONS: RegExp[] = [
  /\.([A-Za-z_$][\w$]*)/g, // member access
  /([A-Za-z_$][\w$]*)\s*:/g, // object key (and labels — harmless)
  /[{,]\s*([A-Za-z_$][\w$]*)\s*[,}]/g, // shorthand object key
  /(?:^|[{;,}]|\n)\s*(?:get |set |static |async |\*)*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g, // method definition
  /["']([A-Za-z_$][\w$]*)["']\s*[:\]]/g, // quoted key / computed access
  /\[\s*["']([A-Za-z_$][\w$]*)["']/g, // computed access, opening side
];

/**
 * Mangle `_`-prefixed (soft-private) property names in the emitted prod
 * artifacts. These members were hard `#`-privates until the 0.5.0 weight
 * pass; TS `private`/`protected` keeps them compile-time-private, and this
 * plugin keeps them out of the shipped bytes — consumers' bundlers can never
 * mangle properties themselves. `__`-prefixed names (`__COMVI__`,
 * `__v_isVNode`) do NOT match the regex.
 *
 * Runs in `generateBundle`, once the WHOLE bundle exists, because two things
 * must be global and terser only computes one of them per invocation:
 *
 *  - the nameCache (shared here), so `_loadNs` gets the same new name in the
 *    chunk that defines it and the chunk that calls it;
 *  - the RESERVED set. terser only avoids names it can see in the chunk it is
 *    minifying. With capability code split across chunks (Phase 7) that is not
 *    enough: `_pendingLoads` lives in the loader chunk, the public `t()` lives
 *    in the class chunk, and terser happily renamed `_pendingLoads` to `t` —
 *    an instance own-property that shadowed `t()` in the prod build only.
 *    Collecting reserved names from every chunk first makes that impossible.
 */
export const mangleInternalProps = (): Plugin => {
  const nameCache = {};
  return {
    name: "comvi:mangle-internal-props",
    async generateBundle(_options, bundle) {
      const chunks = Object.values(
        bundle as Record<string, { type: string; code?: string }>,
      ).filter(
        (file): file is { type: "chunk"; code: string } =>
          file.type === "chunk" && typeof file.code === "string",
      );

      const reserved = new Set<string>();
      for (const chunk of chunks) {
        for (const pattern of PROPERTY_POSITIONS) {
          for (const [, name] of chunk.code.matchAll(pattern)) {
            if (name && !INTERNAL_PROP.test(name)) reserved.add(name);
          }
        }
      }
      const reservedList = [...reserved];

      for (const chunk of chunks) {
        const result = await minify(chunk.code, {
          // Default compression (2 passes): consumers' bundlers minify again
          // anyway, but terser folds dead prod branches and unused arguments
          // that esbuild-class minifiers leave behind.
          compress: { passes: 2 },
          module: true,
          mangle: { properties: { regex: INTERNAL_PROP, reserved: reservedList } },
          nameCache,
          format: { preserve_annotations: true, comments: false },
        });
        if (result.code) {
          // Terser can move a preserved pure annotation from a returned
          // expression in front of the `return` keyword. The annotation has
          // no tree-shaking value inside a function and downstream Rollup
          // warns because only annotations directly before an expression are
          // valid. Keep top-level annotations; remove only this invalid form.
          chunk.code = result.code.replace(/\/\* @__PURE__ \*\/\s*(?=return\b)/g, "");
        }
      }
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
