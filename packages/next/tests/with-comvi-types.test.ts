// @vitest-environment node
/**
 * `withComvi({ types })`: typegen while next.config loads, by phase. The real Next runs
 * (webpack and Turbopack, Next 15 and 16, the process tree) are in
 * `scripts/typegen-e2e/next.test.mjs`; these pin the phase rules on the source.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generate } from "@comvi/typegen";
import { withComvi } from "../src/plugin";

const DEV = "phase-development-server";
const BUILD = "phase-production-build";
const OUT = "src/types/i18n.d.ts";
const roots: string[] = [];

type Run = { watcher?: { close(): void } };
const runs = () =>
  (globalThis as Record<symbol, unknown>)[Symbol.for("comvi.next.types")] as
    Map<string, Run> | undefined;

/** An app declaring @comvi/react, its catalogs in src/locales. */
function project(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "with-comvi-types-")));
  roots.push(root);
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "app", dependencies: { "@comvi/react": "*" } }),
    "src/locales/en.json": JSON.stringify({ hello: "Hello {name}" }),
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  vi.spyOn(process, "cwd").mockReturnValue(root);
  return root;
}

const types = { from: "./src/locales" };
const read = (root: string) => fs.readFileSync(path.join(root, OUT), "utf8");
const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => String(c[0]));

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 25));
  expect(check()).toBe(true);
}

/** A fresh process tree: no runs here, no marker inherited. */
function reset(): void {
  for (const run of runs()?.values() ?? []) run.watcher?.close();
  runs()?.clear();
  delete process.env.COMVI_NEXT_TYPES_BUILT;
}

afterEach(() => {
  reset();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("withComvi({ types }): the option", () => {
  it("throws at withComvi() when `from` names nothing", () => {
    project();
    expect(() => withComvi({ types: { from: "" } })).toThrowError(
      /`types\.from` must name the catalogs directory/,
    );
  });

  it("returns the function form for an object config, and keeps its options", async () => {
    const root = project();
    const config = withComvi({ types })({ reactStrictMode: true });
    expect(typeof config).toBe("function");
    const result = await config("phase-production-server", { defaultConfig: {} });
    expect(result.reactStrictMode).toBe(true);
    // `next start` generates nothing.
    expect(fs.existsSync(path.join(root, OUT))).toBe(false);
  });

  it("calls the app's own config function with the phase", async () => {
    project();
    const user = vi.fn(() => ({ poweredByHeader: false }));
    const config = withComvi({ types })(user);
    const result = await config("phase-test", { defaultConfig: {} });
    expect(user).toHaveBeenCalledWith("phase-test", { defaultConfig: {} });
    expect(result.poweredByHeader).toBe(false);
  });
});

describe("withComvi({ types }): next build", () => {
  it("writes the bytes generate() writes", async () => {
    const root = project();
    await withComvi({ types })()(BUILD, { defaultConfig: {} });
    const api = await generate({ from: "./src/locales", out: "api.d.ts", root });
    expect(read(root)).toBe(api.content);
    expect(read(root)).toMatch(/"hello": \{ "name": string \| number \};/);
  });

  it("fails on a catalog it cannot read, and writes nothing", async () => {
    const root = project();
    fs.writeFileSync(path.join(root, "src/locales/en.json"), "{ broken");
    await expect(withComvi({ types })()(BUILD, { defaultConfig: {} })).rejects.toThrowError(
      /\[@comvi\/next\] Cannot generate src\/types\/i18n\.d\.ts: .*en\.json/,
    );
    expect(fs.existsSync(path.join(root, OUT))).toBe(false);
  });

  it("check: a stale or missing file fails the build and stays as it was", async () => {
    const root = project();
    const checked = withComvi({ types: { ...types, check: true } });
    await expect(checked()(BUILD, { defaultConfig: {} })).rejects.toThrowError(
      /src\/types\/i18n\.d\.ts is outdated/,
    );
    expect(fs.existsSync(path.join(root, OUT))).toBe(false);

    reset();
    await withComvi({ types })()(BUILD, { defaultConfig: {} });
    const fresh = read(root);
    reset();
    await expect(checked()(BUILD, { defaultConfig: {} })).resolves.toBeDefined();

    reset();
    fs.writeFileSync(path.join(root, "src/locales/en.json"), JSON.stringify({ added: "x" }));
    await expect(checked()(BUILD, { defaultConfig: {} })).rejects.toThrowError(/is outdated/);
    expect(read(root)).toBe(fresh);
  });
  it("marks the environment, so a build worker that loads the config again skips", async () => {
    const root = project();
    await withComvi({ types })()(BUILD, { defaultConfig: {} });
    expect(process.env.COMVI_NEXT_TYPES_BUILT).toBe(path.join(root, OUT));
    // A worker: the marker inherited, no run of its own in that process.
    runs()?.clear();
    fs.rmSync(path.join(root, OUT));
    await withComvi({ types })()(BUILD, { defaultConfig: {} });
    expect(fs.existsSync(path.join(root, OUT))).toBe(false);
  });
});

describe("withComvi({ types }): next dev", () => {
  it("writes before the config resolves, and follows the catalogs with one watcher", async () => {
    const root = project();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fsWatch = vi.spyOn(fs, "watch");
    // Next loads the config again in the same process; an app may call withComvi again.
    await withComvi({ types })()(DEV, { defaultConfig: {} });
    expect(read(root)).toMatch(/"hello"/);
    // What one watcher costs here: on Linux, Node's recursive watch calls fs.watch again
    // for the directories it covers.
    const one = fsWatch.mock.calls.length;
    expect(one).toBeGreaterThan(0);
    await withComvi({ types })()(DEV, { defaultConfig: {} });
    await withComvi({ types })()(DEV, { defaultConfig: {} });

    fs.writeFileSync(
      path.join(root, "src/locales/en.json"),
      JSON.stringify({ hello: "Hello {name}", added: "x" }),
    );
    await until(() => read(root).includes('"added": never;'));
    expect(lines(info).filter((l) => /already generated by another watcher/.test(l))).toEqual([]);
    expect(lines(info).filter((l) => / wrote /.test(l))).toHaveLength(2);
    // One watcher started, not one per load.
    expect(fsWatch.mock.calls.length).toBe(one);
    expect(fsWatch.mock.calls[0]![0]).toBe(path.join(root, "src/locales"));
  });

  it("a reloaded config with other options replaces the watcher", async () => {
    const root = project();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await withComvi({ types })()(DEV, { defaultConfig: {} });
    await withComvi({ types: { ...types, augment: "@acme/i18n" } })()(DEV, { defaultConfig: {} });
    expect(read(root)).toContain("declare module '@acme/i18n'");
    expect(lines(info).filter((l) => /already generated by another watcher/.test(l))).toEqual([]);
  });

  it("every param is required: the removed `defaultParams` option is a type error and makes nothing optional (owner decision 2026-11-11)", async () => {
    const root = project();
    vi.spyOn(console, "info").mockImplementation(() => {});
    // @ts-expect-error `defaultParams` is no longer an option of `types`
    await withComvi({ types: { ...types, defaultParams: ["name"] } })()(DEV, { defaultConfig: {} });
    expect(read(root)).toMatch(/"hello": \{ "name": string \| number \};/);
  });

  it("starts no watcher in the process whose parent holds it (next dev's server)", async () => {
    const root = project();
    const { lockFileOf } = await import("@comvi/typegen");
    const lock = lockFileOf(path.join(root, OUT));
    fs.writeFileSync(lock, JSON.stringify({ pid: process.ppid, token: "parent" }));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await withComvi({ types })()(DEV, { defaultConfig: {} });
      expect(fs.existsSync(path.join(root, OUT))).toBe(false);
      expect(lines(info)).toEqual([]);
    } finally {
      fs.rmSync(lock, { force: true });
    }
  });
});
