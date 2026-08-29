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
} as const;

type TrackedCall = keyof typeof realFs;

interface FsWork {
  readdir: MockInstance;
  writeFile: MockInstance;
  /** Arm before acting; resolves when the next `writeFile` has finished writing. */
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
      if (name === "writeFile" && writeWaiters.length > 0) {
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

/** A project root with `locales/en.json` holding `content`. */
async function makeProject(content: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-vite-plugin-"));
  tempDirs.push(root);
  const localesDir = path.join(root, "locales");
  await fs.mkdir(localesDir, { recursive: true });
  await fs.writeFile(path.join(localesDir, "en.json"), content, "utf-8");
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
  describe("buildStart", () => {
    it("writes the declaration file, creating the output directory", async () => {
      const root = await makeProject('{ "greeting": "Hello {name}" }');
      const plugin = comviTypes({ translations: "./locales", output: OUTPUT });
      resolvePlugin(plugin, root, "build");

      await buildStart(plugin);

      const written = await fs.readFile(outputPath(root), "utf-8");
      expect(written).toContain("declare module '@comvi/core' {");
      expect(written).toContain("'greeting': { name: string };");
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
      expect(written).toContain("'greeting': { name?: string };");
      expect(written).toContain("'admin:dashboard': never;");
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
      expect(written).toContain("'farewell': never;");
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

      expect(await fs.readFile(outputPath(root), "utf-8")).toContain("'greeting': never;");
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
  });
});
