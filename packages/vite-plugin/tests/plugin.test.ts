import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { comviTypes } from "../src";

const OUTPUT = "./src/types/i18n.d.ts";

/** Captured before any spy is installed, so a tracker never wraps a previous tracker. */
const realFs = {
  readdir: fs.readdir,
  readFile: fs.readFile,
  mkdir: fs.mkdir,
  writeFile: fs.writeFile,
  rename: fs.rename,
  rm: fs.rm,
} as const;

type TrackedCall = keyof typeof realFs;

interface FsWork {
  readdir: MockInstance;
  writeFile: MockInstance;
  /** Arm before acting; resolves when the next output has landed (its temp file renamed over it). */
  nextWrite(): Promise<void>;
  /** Resolves once every fs operation started so far has settled. */
  settle(): Promise<void>;
}

/**
 * The watcher path calls `void scheduleGenerate(...)`, so a regeneration is
 * fire-and-forget and a test has no promise to await. Wrapping the fs calls it
 * makes gives one: without it, `afterEach` can rm a temp root mid-write
 * (observed as ENOTEMPTY) and assertions can run before the write lands.
 */
function trackFsWork(): FsWork {
  const pending = new Set<Promise<unknown>>();
  let writeWaiters: Array<(write: Promise<unknown>) => void> = [];

  const spies = {} as Record<TrackedCall, MockInstance>;
  for (const name of Object.keys(realFs) as TrackedCall[]) {
    const real = realFs[name] as (...args: unknown[]) => Promise<unknown>;
    spies[name] = vi.spyOn(fs, name).mockImplementation(((...args: unknown[]) => {
      const promise = real(...args);
      pending.add(promise);
      void promise.catch(() => undefined).finally(() => pending.delete(promise));
      if (name === "rename" && writeWaiters.length > 0) {
        const waiters = writeWaiters;
        writeWaiters = [];
        for (const resolve of waiters) resolve(promise);
      }
      return promise;
    }) as never);
  }

  return {
    readdir: spies.readdir,
    writeFile: spies.writeFile,
    async nextWrite() {
      const write = await new Promise<Promise<unknown>>((resolve) => writeWaiters.push(resolve));
      await write;
    },
    async settle() {
      // Draining `pending` once is not enough: the continuation that chains the
      // next fs call runs on a later tick, so wait a full macrotask turn and
      // re-check before declaring the regeneration finished.
      for (;;) {
        while (pending.size > 0) {
          await Promise.allSettled([...pending]);
        }
        await new Promise((resolve) => setImmediate(resolve));
        if (pending.size === 0) return;
      }
    },
  };
}

const tempDirs: string[] = [];
let fsWork: FsWork;

beforeEach(() => {
  fsWork = trackFsWork();
});

afterEach(async () => {
  // drain any watcher-triggered regeneration before removing the roots it writes into
  await fsWork.settle();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/**
 * A project root with `locales/en.json` holding `content`, and a manifest.
 *
 * The manifest is what decides which module the declarations augment, so every
 * project here declares one. `declares: {}` builds the project that declares no
 * Comvi package, which the plugin refuses to generate for.
 */
async function makeProject(
  content: string,
  options: { declares?: Record<string, string> } = {},
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-vite-plugin-"));
  tempDirs.push(root);
  const localesDir = path.join(root, "locales");
  await fs.mkdir(localesDir, { recursive: true });
  await fs.writeFile(path.join(localesDir, "en.json"), content, "utf-8");

  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "app",
      dependencies: options.declares ?? { "@comvi/react": "^0.5.0" },
    }),
    "utf-8",
  );

  return root;
}

function resolvePlugin(plugin: Plugin, root: string, command: "build" | "serve"): void {
  const config = { root, command } as Pick<ResolvedConfig, "root" | "command">;
  (plugin.configResolved as (config: ResolvedConfig) => void)(config as ResolvedConfig);
}

async function buildStart(plugin: Plugin): Promise<void> {
  await (plugin.buildStart as () => Promise<void>)();
}

function outputPath(root: string): string {
  return path.resolve(root, OUTPUT);
}

describe("comviTypes plugin", () => {
  it("identifies itself to vite as comvi-types, ordered before other plugins", () => {
    const plugin = comviTypes({ translations: "./locales", output: OUTPUT });

    expect(plugin.name).toBe("comvi-types");
    expect(plugin.enforce).toBe("pre");
  });

  describe("buildStart", () => {
    it("writes to src/types/i18n.d.ts when no output path is given", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      const plugin = comviTypes({ translations: "./locales" });
      resolvePlugin(plugin, root, "build");

      await buildStart(plugin);

      const written = await fs.readFile(path.resolve(root, "src/types/i18n.d.ts"), "utf-8");
      expect(written).toContain('"greeting": never;');
    });

    it("writes the declaration file, creating the output directory", async () => {
      const root = await makeProject('{ "greeting": "Hello {name}" }');
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "build");

      await buildStart(plugin);

      const written = await fs.readFile(outputPath(root), "utf-8");
      expect(written).toContain("declare module '@comvi/react' {");
      expect(written).toContain('"greeting": { "name": string };');
    });

    it("passes defaultNs and strictParams through to the emitted declarations", async () => {
      const root = await makeProject('{ "greeting": "Hello {name}" }');
      await fs.mkdir(path.join(root, "locales", "admin"), { recursive: true });
      await fs.writeFile(
        path.join(root, "locales", "admin", "en.json"),
        '{ "dashboard": "Admin" }',
        "utf-8",
      );
      const plugin = comviTypes({
        translations: "./locales",
        output: OUTPUT,
        defaultNs: "common",
        strictParams: false,
      });
      resolvePlugin(plugin, root, "build");

      await buildStart(plugin);

      const written = await fs.readFile(outputPath(root), "utf-8");
      // root en.json lands in defaultNs "common" and loses the prefix; admin keeps it
      expect(written).toContain('"greeting": { "name"?: string };');
      expect(written).toContain('"admin:dashboard": never;');
    });

    it("augments the Comvi package the project declares", async () => {
      // The documented install is one package, and core arrives through it as a
      // transitive dependency a strict layout will not let the app name. What
      // the app declares is the one specifier it is certain to resolve.
      const root = await makeProject('{ "greeting": "Hello" }', {
        declares: { "@comvi/svelte": "^0.5.0" },
      });
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "build");

      await buildStart(plugin);

      const written = await fs.readFile(outputPath(root), "utf-8");
      expect(written).toContain("declare module '@comvi/svelte' {");
      expect(written).toContain("import '@comvi/svelte';");
    });

    it("augments the module named by the augment option instead", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      const plugin = comviTypes({
        translations: "./locales",
        output: OUTPUT,
        augment: "@acme/i18n",
      });
      resolvePlugin(plugin, root, "build");

      await buildStart(plugin);

      expect(await fs.readFile(outputPath(root), "utf-8")).toContain(
        "declare module '@acme/i18n' {",
      );
    });

    it("refuses to write when the project declares no Comvi package", async () => {
      // Nothing to augment means an inert file: TypeScript reports TS2882 on
      // the generated import, `skipLibCheck: true` hides even that, and every
      // unknown key type-checks — types that look like they work and do not.
      const root = await makeProject('{ "greeting": "Hello" }', { declares: {} });
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "build");

      await expect(buildStart(plugin)).rejects.toThrow("@comvi/react");
      await expect(fs.readFile(outputPath(root), "utf-8")).rejects.toThrow(/ENOENT/);
    });

    it("warns about a key whose ICU argument core does not implement", async () => {
      // The key is still generated — it exists — but with no parameters, since
      // `@comvi/core` refuses the whole message at ingestion. Silence here
      // would ship a key that looks typed and throws on first render.
      const root = await makeProject('{ "price": "{amount, number}" }');
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "build");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      try {
        await buildStart(plugin);

        expect(warn.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
          "uses the ICU `number` argument type, which @comvi/core does not implement",
        );
      } finally {
        warn.mockRestore();
      }

      const written = await fs.readFile(outputPath(root), "utf-8");
      expect(written).toContain('"price": never;');
    });

    it("skips the write when the generated content is unchanged", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "build");

      await buildStart(plugin);
      fsWork.writeFile.mockClear();
      await buildStart(plugin);

      expect(fsWork.writeFile).not.toHaveBeenCalled();
    });

    it("rewrites the file after the translations change", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "build");

      await buildStart(plugin);
      await fs.writeFile(
        path.join(root, "locales", "en.json"),
        '{ "greeting": "Hello", "farewell": "Bye" }',
        "utf-8",
      );
      await buildStart(plugin);

      const written = await fs.readFile(outputPath(root), "utf-8");
      expect(written).toContain('"farewell": never;');
    });

    /**
     * A failed write must not be remembered as written: the content used to be
     * cached before the write, so an identical regeneration after a transient
     * failure (EACCES, a full disk) returned early and never wrote the file.
     */
    it("writes an unchanged generation after the previous write failed", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      vi.spyOn(console, "error").mockImplementation(() => {});
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "serve");
      fsWork.writeFile.mockImplementationOnce(async () => {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      });

      await buildStart(plugin);
      await expect(fs.access(outputPath(root))).rejects.toThrow(/ENOENT/);

      await buildStart(plugin);
      expect(await fs.readFile(outputPath(root), "utf-8")).toContain('"greeting": never;');
    });

    it("keeps the existing declarations intact when a write fails partway", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      vi.spyOn(console, "error").mockImplementation(() => {});
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "serve");
      await buildStart(plugin);
      const before = await fs.readFile(outputPath(root), "utf-8");

      await fs.writeFile(
        path.join(root, "locales", "en.json"),
        '{ "greeting": "Hello", "farewell": "Bye" }',
        "utf-8",
      );
      // The disk fills mid-write: a prefix lands, then the write fails.
      fsWork.writeFile.mockImplementationOnce(async (file, data, options) => {
        await realFs.writeFile(file as string, String(data).slice(0, 10), options as never);
        throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
      });
      await buildStart(plugin);

      expect(await fs.readFile(outputPath(root), "utf-8")).toBe(before);
      expect(await fs.readdir(path.dirname(outputPath(root)))).toEqual(["i18n.d.ts"]);
    });

    it("should fail vite build when type generation fails", async () => {
      const root = await makeProject("{ invalid json");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "build");

      await expect(buildStart(plugin)).rejects.toThrow(SyntaxError);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[@comvi/vite-plugin] Failed to generate types:"),
      );
    });

    it("logs but does not throw when type generation fails in dev mode", async () => {
      const root = await makeProject("{ invalid json");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "serve");

      await expect(buildStart(plugin)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[@comvi/vite-plugin] Failed to generate types:"),
      );
      await expect(fs.access(outputPath(root))).rejects.toThrow(/ENOENT/);
    });
  });

  describe("configureServer", () => {
    function fakeServer(): {
      server: ViteDevServer;
      handlers: Map<string, (file: string) => void>;
      added: string[];
    } {
      const handlers = new Map<string, (file: string) => void>();
      const added: string[] = [];
      const server = {
        watcher: {
          add: (dir: string) => added.push(dir),
          on: (event: string, handler: (file: string) => void) => {
            handlers.set(event, handler);
          },
        },
      } as unknown as ViteDevServer;
      return { server, handlers, added };
    }

    it("watches the translations directory for change, add and unlink", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "serve");
      const { server, handlers, added } = fakeServer();

      (plugin.configureServer as (server: ViteDevServer) => void)(server);

      expect(added).toEqual([path.join(root, "locales")]);
      expect([...handlers.keys()].sort()).toEqual(["add", "change", "unlink"]);
    });

    it("regenerates for a JSON file inside the translations directory", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "serve");
      const { server, handlers } = fakeServer();
      (plugin.configureServer as (server: ViteDevServer) => void)(server);
      const written = fsWork.nextWrite();

      handlers.get("change")!(path.join(root, "locales", "en.json"));
      await written;

      expect(await fs.readFile(outputPath(root), "utf-8")).toContain('"greeting": never;');
    });

    it.each([
      { shape: "a non-JSON file inside the directory", file: ["locales", "notes.md"] },
      { shape: "a JSON file outside the directory", file: ["other", "en.json"] },
      { shape: "the translations directory itself", file: ["locales"] },
    ])("ignores $shape", async ({ file }) => {
      const root = await makeProject('{ "greeting": "Hello" }');
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "serve");
      const { server, handlers } = fakeServer();
      (plugin.configureServer as (server: ViteDevServer) => void)(server);
      // extractSchema reads the directory synchronously before its first await,
      // so a skipped regeneration is observable the moment the handler returns.
      fsWork.readdir.mockClear();

      handlers.get("change")!(path.join(root, ...file));

      expect(fsWork.readdir).not.toHaveBeenCalled();
    });

    it("ignores an event for the watched path itself when that path ends in .json", async () => {
      const root = await makeProject('{ "greeting": "Hello" }');
      // `translations` is documented as a directory; pointed at a file, the
      // watched path IS the event's path and regenerating from it would fail.
      const plugin = comviTypes({ translations: "./locales/en.json", output: OUTPUT });
      resolvePlugin(plugin, root, "serve");
      const { server, handlers } = fakeServer();
      (plugin.configureServer as (server: ViteDevServer) => void)(server);
      fsWork.readdir.mockClear();

      handlers.get("change")!(path.join(root, "locales", "en.json"));

      expect(fsWork.readdir).not.toHaveBeenCalled();
    });

    /**
     * The watcher discards the promise (`void scheduleGenerate(…)`), so a
     * regeneration that rethrows would leave an unhandled rejection behind
     * rather than a caught error. That is what the listener below watches for.
     */
    it("reports a watcher-triggered failure without leaving a rejection behind", async () => {
      const root = await makeProject("{ invalid json");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "serve");
      const { server, handlers } = fakeServer();
      (plugin.configureServer as (server: ViteDevServer) => void)(server);

      handlers.get("change")!(path.join(root, "locales", "en.json"));

      await fsWork.settle();
      await new Promise((resolve) => setImmediate(resolve));
      process.off("unhandledRejection", onUnhandled);
      expect(unhandled).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[@comvi/vite-plugin] Failed to generate types:"),
      );
      await expect(fs.access(outputPath(root))).rejects.toThrow(/ENOENT/);
    });
  });
});
