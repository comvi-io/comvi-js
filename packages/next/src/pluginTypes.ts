/**
 * `withComvi({ types })`: the typed-translations declaration from local JSON catalogs,
 * written while next.config loads. Node only, like the rest of `@comvi/next/plugin`.
 *
 * A thin wrapper over the typegen Node API (the workspace-private typegen package,
 * inlined at build time), so the bytes are the ones `comvi typegen --from` and
 * `@comvi/vite-plugin` write for the same catalogs. It runs in config loading, not in a
 * bundler, so webpack and Turbopack get the same file:
 *
 * - `next dev` (`phase-development-server`): generates, then one watcher regenerates on
 *   every change until the process exits;
 * - `next build` (`phase-production-build`): generates once; with `check: true` it writes
 *   nothing and fails the build when the file on disk is stale;
 * - any other phase (`next start`, `next lint`, …): nothing.
 *
 * Next loads the config more than once: again in the same process (`next build` of
 * Next 16), and in the server process `next dev` of Next 15 starts. One run per process
 * tree: a repeated load in this process reuses its first run; a process whose parent
 * holds the watcher's lock starts none (`next dev`'s server, started with the environment
 * from before the config loaded); and `next build`'s workers, which Next 15 may let load
 * the config again, inherit a marker in the environment and skip. An unrelated process (a second `next dev` of the same app) is kept from
 * writing by typegen's own lock: its watcher stays idle and takes over when the first
 * one stops.
 */
import fs from "node:fs";
import path from "node:path";
import { generate, lockFileOf, watch, type GenerateMessage, type Watcher } from "@comvi/typegen";

export interface WithComviTypes {
  /**
   * The catalogs: a directory of JSON files (`<locale>.json` is the `default` namespace,
   * `<namespace>/<locale>.json` the others), or a wire schema v2 file such as
   * `.comvi/schema.json` from `comvi pull`. Resolved against `process.cwd()`.
   * @example "./src/locales"
   */
  from: string;
  /** The declaration file to write. @default './src/types/i18n.d.ts' */
  out?: string;
  /** The locale the types come from; required when the directory has more than one. */
  sourceLocale?: string;
  /** Maps a file to its locale and namespace. @default '{namespace}/{languageTag}.json' */
  fileTemplate?: string;
  /**
   * The module the declaration augments. By default the Comvi package the app's
   * `package.json` declares (`@comvi/core`, else its binding).
   */
  augment?: string;
  /**
   * `next build` writes nothing and fails when the declaration on disk differs from the
   * catalogs (or is missing): for CI, with the file committed. `next dev` still writes it.
   * @default false
   */
  check?: boolean;
}

const PREFIX = "[@comvi/next]";
/** The declaration files a `next build` of this process tree has generated, one per line. */
const BUILT = "COMVI_NEXT_TYPES_BUILT";
const DEV = "phase-development-server";
const BUILD = "phase-production-build";

function print({ level, text }: GenerateMessage): void {
  (level === "info" ? console.info : level === "warn" ? console.warn : console.error)(
    `${PREFIX} ${text}`,
  );
}

/** Throws at `withComvi()` when the option cannot name the catalogs. */
export function validateTypes(types: WithComviTypes): void {
  if (typeof types?.from !== "string" || types.from === "")
    throw new TypeError(
      `${PREFIX} withComvi: \`types.from\` must name the catalogs directory, e.g. "./src/locales"`,
    );
}

interface Run {
  /** The options the run started with: a reloaded config with other options restarts it. */
  signature: string;
  done: Promise<void>;
  watcher?: Watcher;
}

/**
 * This process's runs, by phase and declaration file. On `globalThis`, so a config that
 * Next loads through a fresh module registry still finds them.
 */
const runs: Map<string, Run> = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("comvi.next.types")
] ??= new Map()) as Map<string, Run>;

/**
 * The process holding the watcher lock of `out`, if any. `next dev` starts its server
 * with the environment it had before the config loaded, so a marker in the environment
 * would not reach it: the server sees its parent in the lock instead.
 */
function lockHolder(out: string): number | undefined {
  try {
    const { pid } = JSON.parse(fs.readFileSync(lockFileOf(out), "utf8")) as { pid?: unknown };
    return typeof pid === "number" ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Runs typegen for `phase`: resolves once the declaration is written (dev, build) or
 * checked (build with `check`). Rejects only in `next build`, which must not ship
 * against types that no longer match the catalogs; `next dev` reports and goes on.
 */
export function runTypes(phase: string, types: WithComviTypes, root: string): Promise<void> {
  if (phase !== DEV && phase !== BUILD) return Promise.resolve();
  const { check = false, ...rest } = types;
  const settings = {
    ...rest,
    out: types.out ?? "./src/types/i18n.d.ts",
    root,
    onMessage: print,
  };
  const out = path.resolve(root, settings.out);
  const key = `${phase}\t${out}`;
  const signature = JSON.stringify({ ...rest, check, root });
  const previous = runs.get(key);
  if (previous?.signature === signature) return previous.done;
  // Started by the process that watches already: the server process of `next dev`.
  if (!previous && phase === DEV && lockHolder(out) === process.ppid) return Promise.resolve();
  const built = (process.env[BUILT] ?? "").split("\n");
  if (!previous && phase === BUILD && built.includes(out)) return Promise.resolve();
  previous?.watcher?.close();

  const run: Run = { signature, done: Promise.resolve() };
  if (phase === DEV) {
    run.watcher = watch(settings);
    run.done = run.watcher.ready;
  } else {
    const shown = path.relative(root, out) || out;
    run.done = generate({ ...settings, check }).then(
      (result) => {
        if (check && result.stale)
          throw new Error(
            `${PREFIX} ${shown} is outdated: it differs from the catalogs in ${types.from}. ` +
              "Regenerate it (`next dev`, `next build` without `types.check`, or " +
              `\`comvi typegen --from ${types.from}\`) and commit it.`,
          );
      },
      (error: unknown) => {
        throw Object.assign(
          new Error(`${PREFIX} Cannot generate ${shown}: ${(error as Error).message}`),
          { cause: error },
        );
      },
    );
  }
  runs.set(key, run);
  if (phase === BUILD && !built.includes(out))
    process.env[BUILT] = [...built.filter(Boolean), out].join("\n");
  return run.done;
}
