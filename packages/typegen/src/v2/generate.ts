/**
 * The one Node API of 0.8 typegen (design rev 3 R3-18): `generate()` once, `watch()` for
 * development. The CLI (`comvi typegen --from`), the Vite plugin, the Nuxt module and
 * `withComvi({ types })` of `@comvi/next/plugin` are thin wrappers over these two, so
 * every one of them writes the same bytes for the same catalogs.
 *
 * `from` is a directory of JSON catalogs (`local.ts`), a wire schema v2 file (what
 * `comvi pull` writes to `.comvi/schema.json`) or the Comvi platform (`platform.ts`).
 * Writes are atomic (a temporary file in the same directory, then
 * rename: tsserver never reads half a file) and skipped when the content is unchanged
 * (no dev-server reload loop). In `watch()`, bursts of changes are debounced into one
 * run, only the namespaces whose files changed are re-read, and a broken catalog file
 * is reported once while the declaration file stays as it was. One declaration file has
 * one writer: a second `watch()` of the same file — in this process (a reloaded config)
 * or another (a second dev server, a framework worker) — stays idle until the first
 * closes or its process dies (a lock file per declaration file in the OS temp directory).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveAugmentationTarget } from "../augment";
import type { SchemaWarning } from "./build";
import { emitCatalogs } from "./emit";
import { CatalogFileError, LocalSource } from "./local";
import { PlatformSource, type PlatformError, type PlatformSourceOptions } from "./platform";
import { parseWireSchema, type WireSchema } from "./wire";

export type From = string | { platform: PlatformSourceOptions };

export interface GenerateOptions {
  /**
   * A directory of JSON catalogs, a wire schema v2 file (`.comvi/schema.json`, written by
   * `comvi pull`), or `{ platform: {} }` (key from `COMVI_API_KEY`).
   */
  from: From;
  /** The declaration file to write, e.g. `./comvi.d.ts`. */
  out: string;
  /** The app's root: relative paths resolve against it and its package.json names `augment`. @default process.cwd() */
  root?: string;
  /** Directory source: the locale the types come from (required with more than one). */
  sourceLocale?: string;
  /** Directory source: @default '{namespace}/{languageTag}.json' */
  fileTemplate?: string;
  /** The module to augment; by default the Comvi package the app's package.json declares. */
  augment?: string;
  /** The keys of `createI18n({ defaultParams })`: optional in every key's params. */
  defaultParams?: readonly string[];
  /** Write nothing; report whether the file on disk is stale. */
  check?: boolean;
  /** Warnings and notices. @default prints each distinct line once to the console */
  onMessage?: (message: GenerateMessage) => void;
}

export interface GenerateMessage {
  level: "info" | "warn" | "error";
  text: string;
}

export interface GenerateResult {
  /** The declaration file's content. */
  content: string;
  /** The file on disk was replaced (never in `check` mode). */
  written: boolean;
  /** `check` mode: the file on disk differs from `content` (or is missing). */
  stale: boolean;
  namespaces: number;
  keys: number;
  warnings: SchemaWarning[];
}

/** Writes `content` to `file` atomically, unless the file already holds exactly it. */
export function writeIfChanged(file: string, content: string): boolean {
  let current: string | undefined;
  try {
    current = fs.readFileSync(file, "utf8");
  } catch {
    current = undefined;
  }
  if (current === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return true;
}

const describeWarning = (w: SchemaWarning) =>
  `${w.namespace} ${JSON.stringify(w.key)}${w.locale ? ` (${w.locale})` : ""}: ${w.message}`;

function defaultReporter(): (m: GenerateMessage) => void {
  const seen = new Set<string>();
  return ({ level, text }) => {
    const line = `[comvi typegen] ${text}`;
    if (level !== "error" && seen.has(line)) return;
    seen.add(line);
    (level === "info" ? console.log : level === "warn" ? console.warn : console.error)(line);
  };
}

interface Context {
  root: string;
  out: string;
  augment: string;
  options: GenerateOptions;
  report: (m: GenerateMessage) => void;
}

function context(options: GenerateOptions): Context {
  const root = path.resolve(options.root ?? process.cwd());
  return {
    root,
    out: path.resolve(root, options.out),
    augment: resolveAugmentationTarget(root, options.augment),
    options,
    report: options.onMessage ?? defaultReporter(),
  };
}

function finish(ctx: Context, schema: WireSchema, warnings: SchemaWarning[]): GenerateResult {
  const content = emitCatalogs(schema, {
    augment: ctx.augment,
    defaultParams: ctx.options.defaultParams,
  });
  for (const w of warnings) ctx.report({ level: "warn", text: describeWarning(w) });
  let stale = false;
  let written = false;
  if (ctx.options.check) {
    let current: string | undefined;
    try {
      current = fs.readFileSync(ctx.out, "utf8");
    } catch {
      current = undefined;
    }
    stale = current !== content;
  } else written = writeIfChanged(ctx.out, content);
  const nss = Object.values(schema.namespaces);
  return {
    content,
    written,
    stale,
    namespaces: nss.length,
    keys: nss.reduce((n, keys) => n + Object.keys(keys).length, 0),
    warnings,
  };
}

const isPlatform = (from: From): from is { platform: PlatformSourceOptions } =>
  typeof from === "object" && from !== null && "platform" in from;

/** A string `from` naming a file (not a directory) is a wire schema v2 file. */
const isSchemaFile = (file: string): boolean => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return file.endsWith(".json");
  }
};

/** Reads a wire schema v2 file; a missing, broken or invalid file is a {@link CatalogFileError}. */
function readSchemaFile(file: string): WireSchema {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new CatalogFileError(file, (e as Error).message);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new CatalogFileError(file, `invalid JSON (${(e as Error).message})`);
  }
  try {
    return parseWireSchema(json);
  } catch (e) {
    throw new CatalogFileError(file, (e as Error).message);
  }
}

function localSource(ctx: Context, from: string): LocalSource {
  return new LocalSource({
    dir: path.resolve(ctx.root, from),
    sourceLocale: ctx.options.sourceLocale,
    fileTemplate: ctx.options.fileTemplate,
  });
}

/**
 * Generates the declaration file once. Throws on a broken catalog file, an unreachable
 * platform or a schema the declarations cannot express; the file on disk is then left
 * as it was.
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const ctx = context(options);
  if (isPlatform(options.from)) {
    const schema = await new PlatformSource(options.from.platform).schema();
    return finish(ctx, schema, []);
  }
  const file = path.resolve(ctx.root, options.from);
  if (isSchemaFile(file)) return finish(ctx, readSchemaFile(file), []);
  const source = localSource(ctx, options.from);
  source.refresh();
  const { schema, warnings } = source.schema();
  return finish(ctx, schema, warnings);
}

export interface WatchOptions extends Omit<GenerateOptions, "check"> {
  /** Quiet time before a burst of changes is generated. @default 100 */
  debounceMs?: number;
  /**
   * The platform refused the API key (HTTP 401/403): the watcher has stopped for good.
   * Also reported through `onMessage` as an error.
   */
  onFatal?: (error: PlatformError) => void;
}

export interface Watcher {
  /** Resolves after the first generation (or its reported failure), or once idle as a second writer. */
  ready: Promise<void>;
  /** Resolves when no change is pending and no run is in flight. */
  idle(): Promise<void>;
  close(): void;
  /**
   * This watcher writes the file. `false` while another watcher of the same file — in this
   * process or another — holds its lock; it takes over when that one closes or dies.
   */
  readonly active: boolean;
  /** Counted work, for the gates: runs, catalog files read and parsed, files written. */
  readonly stats: { runs: number; readFiles: number; parsedFiles: number; writes: number };
}

/** How often an idle second watcher checks whether the writer's process is still alive. */
const LOCK_POLL_MS = 1000;

/**
 * Watchers of this process waiting for a file's lock, by lock path: told at once when a
 * watcher here releases it. On `globalThis`, so two copies of this module (a bundled
 * plugin and the CLI) share it.
 */
const waiting: Map<string, Set<() => void>> = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("comvi.typegen.lockWaiters")
] ??= new Map()) as Map<string, Set<() => void>>;

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** The lock of one declaration file: in the OS temp directory, so the app's tree stays clean. */
export const lockFileOf = (out: string): string =>
  path.join(
    os.tmpdir(),
    `comvi-typegen-${createHash("sha256").update(path.resolve(out)).digest("hex").slice(0, 16)}.lock`,
  );

/**
 * Takes `lock` for `token`, or reports who holds it. A lock left by a process that
 * no longer runs (or that cannot be read) is taken over.
 */
function acquire(lock: string, token: string): { owned: true } | { owned: false; pid: number } {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token }), { flag: "wx" });
      return { owned: true };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    let holder: { pid?: unknown } | undefined;
    try {
      holder = JSON.parse(fs.readFileSync(lock, "utf8")) as { pid?: unknown };
    } catch {
      holder = undefined;
    }
    if (typeof holder?.pid === "number" && alive(holder.pid))
      return { owned: false, pid: holder.pid };
    fs.rmSync(lock, { force: true });
  }
  return { owned: false, pid: -1 };
}

function release(lock: string, token: string): void {
  try {
    if ((JSON.parse(fs.readFileSync(lock, "utf8")) as { token?: unknown }).token === token)
      fs.rmSync(lock, { force: true });
  } catch {
    // Gone already, or not ours.
  }
  for (const wake of [...(waiting.get(lock) ?? [])]) wake();
}

/**
 * Generates, then regenerates on every change of the source until `close()`. Never
 * throws after start: a failed run is reported through `onMessage` and the file on disk
 * stays as it was.
 */
export function watch(options: WatchOptions): Watcher {
  const ctx = context(options);
  const debounceMs = options.debounceMs ?? 100;
  const stats = { runs: 0, readFiles: 0, parsedFiles: 0, writes: 0 };
  let closed = false;
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let pending = false;
  let idleWaiters: Array<() => void> = [];
  const dirty = new Set<string>();
  let everything = true;
  let stop: (() => void) | undefined;
  let lastError: string | undefined;

  const platform = isPlatform(options.from) ? new PlatformSource(options.from.platform) : undefined;
  const schemaFile =
    typeof options.from === "string" && isSchemaFile(path.resolve(ctx.root, options.from))
      ? path.resolve(ctx.root, options.from)
      : undefined;
  const local =
    typeof options.from === "string" && !schemaFile ? localSource(ctx, options.from) : undefined;
  const where = () => path.relative(ctx.root, ctx.out) || ctx.out;

  const settleIdle = () => {
    if (running || pending || timer) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const w of waiters) w();
  };

  const runOnce = async () => {
    stats.runs++;
    try {
      let result: GenerateResult;
      if (platform) result = finish(ctx, await platform.schema(), []);
      else if (schemaFile) result = finish(ctx, readSchemaFile(schemaFile), []);
      else {
        const todo = everything ? undefined : [...dirty];
        everything = false;
        dirty.clear();
        try {
          local!.refresh(todo);
        } finally {
          stats.readFiles = local!.readFiles;
          stats.parsedFiles = local!.parsedFiles;
        }
        const { schema, warnings } = local!.schema();
        result = finish(ctx, schema, warnings);
      }
      if (result.written) {
        stats.writes++;
        ctx.report({
          level: "info",
          text: `wrote ${where()} (${result.keys} keys, ${result.namespaces} namespaces)`,
        });
      }
      lastError = undefined;
    } catch (e) {
      const text = `${(e as Error).message}; ${where()} is kept as it was`;
      // One message per broken state, not one per save that leaves it broken.
      if (text !== lastError) ctx.report({ level: "error", text });
      lastError = text;
      // The failed namespaces are read again on the next change.
      if (local && e instanceof CatalogFileError) {
        const ref = local.namespaceOf(e.file);
        if (ref) dirty.add(ref.ns);
      }
    }
  };

  const kick = () => {
    if (closed) return;
    timer = undefined;
    if (running) {
      pending = true;
      return;
    }
    running = (async () => {
      do {
        pending = false;
        await runOnce();
      } while (pending && !closed);
    })().finally(() => {
      running = undefined;
      settleIdle();
    });
  };

  const schedule = () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(kick, debounceMs);
  };

  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));

  /** Starts watching the source: called once this watcher holds the lock. */
  const start = () => {
    if (local || schemaFile) {
      const dir = local ? local.dir : path.dirname(schemaFile!);
      const base = schemaFile && path.basename(schemaFile);
      let fsWatcher: fs.FSWatcher;
      try {
        fsWatcher = fs.watch(dir, { recursive: !!local }, (_event, filename) => {
          if (schemaFile) {
            // Editors and `comvi pull` replace the file: watch its directory, by name.
            if (filename && String(filename) !== base) return;
          } else if (!filename) everything = true;
          else {
            const ref = local!.namespaceOf(String(filename));
            if (!ref) return;
            dirty.add(ref.ns);
          }
          schedule();
        });
      } catch (e) {
        ctx.report({ level: "error", text: `Cannot watch ${dir}: ${(e as Error).message}` });
        resolveReady();
        return;
      }
      stop = () => fsWatcher.close();
      kick();
      void running!.then(resolveReady);
    } else {
      let first = true;
      stop = platform!.subscribe(
        () => {
          if (first) {
            first = false;
            kick();
            void running?.then(resolveReady);
          } else schedule();
        },
        {
          onNotice: (text) => ctx.report({ level: "info", text }),
          onFatal: (e) => {
            ctx.report({ level: "error", text: e.message });
            resolveReady();
            options.onFatal?.(e);
          },
        },
      );
    }
  };

  // One writer per declaration file (R3-18: a reloaded config, a second dev server, a
  // framework worker must not write it twice).
  const lock = lockFileOf(ctx.out);
  const token = `${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
  let poll: ReturnType<typeof setInterval> | undefined;
  let holder = -1;
  const onExit = () => release(lock, token);
  const tryOwn = (): boolean => {
    if (closed || active) return active;
    const got = acquire(lock, token);
    if (!got.owned) {
      holder = got.pid;
      return false;
    }
    active = true;
    clearInterval(poll);
    waiting.get(lock)?.delete(tryOwn);
    process.once("exit", onExit);
    if (poll !== undefined) ctx.report({ level: "info", text: `took over ${where()}` });
    start();
    return true;
  };
  if (!tryOwn()) {
    const other = holder > 0 && holder !== process.pid ? ` (process ${holder})` : "";
    ctx.report({
      level: "info",
      text: `${where()} is already generated by another watcher${other}; this one takes over when it stops`,
    });
    let set = waiting.get(lock);
    if (!set) waiting.set(lock, (set = new Set()));
    set.add(tryOwn);
    poll = setInterval(tryOwn, LOCK_POLL_MS);
    poll.unref?.();
    resolveReady();
  }

  return {
    ready,
    stats,
    get active() {
      return active;
    },
    idle: () =>
      new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
        settleIdle();
      }),
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      clearInterval(poll);
      timer = undefined;
      pending = false;
      stop?.();
      const set = waiting.get(lock);
      set?.delete(tryOwn);
      if (set?.size === 0) waiting.delete(lock);
      if (active) {
        active = false;
        process.removeListener("exit", onExit);
        release(lock, token);
      }
      settleIdle();
    },
  };
}
