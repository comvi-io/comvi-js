/**
 * @comvi/vite-plugin — the typed-translations declaration from local JSON catalogs, on
 * `vite dev` and `vite build`.
 *
 * A thin wrapper over the typegen Node API (the workspace-private typegen package, inlined at build time):
 * `vite build` calls `generate()` once and fails the build on an error; `vite dev` runs
 * `watch()` until the server closes. The bytes are the ones `comvi typegen --from`, Next and
 * Nuxt write for the same catalogs.
 *
 * @example
 * ```ts
 * import { comviTypes } from "@comvi/vite-plugin";
 *
 * export default defineConfig({
 *   plugins: [comviTypes({ from: "./src/locales", sourceLocale: "en" })],
 * });
 * ```
 */
import path from "node:path";
import type { Plugin } from "vite";
import { generate, watch, type GenerateMessage, type Watcher } from "@comvi/typegen";

export interface ComviTypesOptions {
  /**
   * The catalogs: a directory of JSON files (`<locale>.json` is the `default` namespace,
   * `<namespace>/<locale>.json` the others), or a wire schema v2 file such as
   * `.comvi/schema.json` from `comvi pull`. Resolved against the Vite root.
   */
  from: string;
  /** The declaration file to write. @default './src/types/i18n.d.ts' */
  out?: string;
  /** The locale the types come from; required when the directory has more than one. */
  sourceLocale?: string;
  /** Maps a file to its locale and namespace. @default '{namespace}/{languageTag}.json' */
  fileTemplate?: string;
  /** The keys of `createI18n({ defaultParams })`: optional in every key's params. */
  defaultParams?: readonly string[];
  /**
   * The module the declaration augments. By default the Comvi package the app's
   * `package.json` declares (`@comvi/core`, else its binding).
   */
  augment?: string;
}

const PREFIX = "[@comvi/vite-plugin]";

function print({ level, text }: GenerateMessage): void {
  (level === "info" ? console.info : level === "warn" ? console.warn : console.error)(
    `${PREFIX} ${text}`,
  );
}

export function comviTypes(options: ComviTypesOptions): Plugin {
  if (typeof options?.from !== "string" || options.from === "")
    throw new TypeError(
      `${PREFIX} \`from\` must name the catalogs directory, e.g. "./src/locales"`,
    );

  let root = process.cwd();
  let build = false;
  let watcher: Watcher | undefined;
  const settings = () => ({
    from: options.from,
    out: options.out ?? "./src/types/i18n.d.ts",
    root,
    sourceLocale: options.sourceLocale,
    fileTemplate: options.fileTemplate,
    defaultParams: options.defaultParams,
    augment: options.augment,
    onMessage: print,
  });

  return {
    name: "comvi-types",
    enforce: "pre",

    configResolved(config) {
      root = config.root;
      build = config.command === "build";
    },

    async buildStart() {
      if (!build) return;
      try {
        await generate(settings());
      } catch (error) {
        // A build must not ship against types that no longer match the catalogs.
        throw Object.assign(
          new Error(
            `${PREFIX} Cannot generate ${path.relative(root, path.resolve(root, settings().out))}: ${(error as Error).message}`,
          ),
          { cause: error },
        );
      }
    },

    configureServer() {
      // One watcher per server; a reloaded config closes the old server (and with it this
      // watcher) first, and typegen keeps one writer per file even if it does not.
      watcher?.close();
      watcher = watch(settings());
    },

    buildEnd() {
      // `vite dev`: called when the server closes.
      watcher?.close();
      watcher = undefined;
    },
  };
}
