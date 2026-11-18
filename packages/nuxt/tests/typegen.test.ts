/**
 * `comvi.types` over the real typegen Node API and real files: the hooks the module
 * registers, what they write, and the build/dev policy. The real Nuxt commands are the e2e
 * (`scripts/typegen-e2e/nuxt.test.mjs`).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as typegen from "@comvi/typegen";
import { setupTypes } from "../src/typegen";

vi.mock("@comvi/typegen", async (original) => {
  const real = await original<typeof import("@comvi/typegen")>();
  return { ...real, generate: vi.fn(real.generate), watch: vi.fn(real.watch) };
});

type Hook = (...args: any[]) => unknown;

const roots: string[] = [];
const closers: Array<() => unknown> = [];
afterEach(async () => {
  vi.mocked(typegen.generate).mockClear();
  vi.mocked(typegen.watch).mockClear();
  for (const close of closers.splice(0)) await close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function write(root: string, rel: string, content: unknown): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(
    path.join(root, rel),
    typeof content === "string" ? content : JSON.stringify(content),
  );
}

/** A Nuxt app on disk (package.json declaring @comvi/nuxt, two locales) and a Nuxt stub. */
function app({ dev = false, root = "" } = {}) {
  if (!root) {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "comvi-nuxt-types-")));
    roots.push(root);
    write(root, "package.json", { name: "app", dependencies: { "@comvi/nuxt": "^0.8.0" } });
    write(root, "i18n/locales/en.json", { hello: "Hello {name}", nav: { home: "Home" } });
    // `de` names its param `wer`: which locale the types came from shows in the output.
    write(root, "i18n/locales/de.json", { hello: "Hallo {wer}", nav: { home: "Start" } });
  }
  const hooks = new Map<string, Hook[]>();
  const nuxt = {
    options: { rootDir: root, buildDir: path.join(root, ".nuxt"), dev },
    hook: vi.fn((name: string, fn: Hook) => {
      hooks.set(name, [...(hooks.get(name) ?? []), fn]);
    }),
  };
  const call = async (name: string, ...args: unknown[]) => {
    for (const fn of hooks.get(name) ?? []) await fn(...args);
  };
  closers.push(() => call("close"));
  /** `prepare:types` as Nuxt calls it; returns the app references it collected. */
  const prepare = async () => {
    const references: Array<{ path: string }> = [];
    await call("prepare:types", { references, declarations: [] });
    return references;
  };
  const out = path.join(root, ".nuxt/types/comvi.d.ts");
  return { root, nuxt: nuxt as any, hooks, call, prepare, out };
}

const read = (file: string) => fs.readFileSync(file, "utf8");

async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe("comvi.types", () => {
  it("refuses a `from` that names no catalogs, before any hook", () => {
    for (const types of [{}, { from: "" }, { from: 1 }, undefined]) {
      const a = app();
      expect(() => setupTypes(a.nuxt, types as any, "en")).toThrow(
        /^\[@comvi\/nuxt\] `comvi\.types\.from` must name the catalogs directory/,
      );
      expect(a.nuxt.hook).not.toHaveBeenCalled();
    }
  });

  it("writes <buildDir>/types/comvi.d.ts from `from` under rootDir, in defaultLocale, and references it", async () => {
    const a = app();
    setupTypes(a.nuxt, { from: "./i18n/locales" }, "de");
    expect(fs.existsSync(a.out)).toBe(false);

    expect(await a.prepare()).toEqual([{ path: a.out }]);
    const content = read(a.out);
    expect(content).toContain("declare module '@comvi/nuxt' {");
    expect(content).toContain('"nav.home": never;');
    expect(content).toContain('"hello": { "wer": string | number };');

    // The Nitro project gets the same file.
    const references: Array<{ path: string }> = [];
    await a.call("nitro:prepare:types", { references, declarations: [] });
    expect(references).toEqual([{ path: a.out }]);

    // The bytes of the Node API for the same settings.
    const direct = await typegen.generate({
      from: "./i18n/locales",
      out: "./direct.d.ts",
      root: a.root,
      sourceLocale: "de",
    });
    expect(direct.content).toBe(content);
  });

  it("writes into typesDir when Nuxt builds elsewhere (a second Nuxt 4 production build)", async () => {
    const a = app();
    a.nuxt.options.buildDir = path.join(a.root, "node_modules/.cache/nuxt/.nuxt");
    a.nuxt.options.typesDir = path.join(a.root, ".nuxt");
    setupTypes(a.nuxt, { from: "./i18n/locales" }, "en");
    expect(await a.prepare()).toEqual([{ path: a.out }]);
    expect(read(a.out)).toContain('"hello": { "name": string | number };');
  });

  it("an explicit sourceLocale, out, fileTemplate and augment win", async () => {
    const a = app();
    write(a.root, "catalogs/messages.en.json", { only: "Only {x}" });
    setupTypes(
      a.nuxt,
      {
        from: "catalogs",
        out: "types/i18n.d.ts",
        sourceLocale: "en",
        fileTemplate: "messages.{languageTag}.json",
        augment: "~/i18n",
      },
      "de",
    );
    const out = path.join(a.root, "types/i18n.d.ts");
    expect(await a.prepare()).toEqual([{ path: out }]);
    expect(read(out)).toContain("declare module '~/i18n' {");
    expect(read(out)).toContain('"only": { "x": string | number };');
    expect(fs.existsSync(a.out)).toBe(false);
  });

  it("outside dev: generates once, and a broken catalog fails the command, the file kept", async () => {
    const a = app();
    setupTypes(a.nuxt, { from: "./i18n/locales" }, "en");
    await a.prepare();
    await a.prepare();
    expect(typegen.generate).toHaveBeenCalledTimes(1);
    expect(typegen.watch).not.toHaveBeenCalled();

    // The next command (a new Nuxt) on a broken catalog.
    const before = read(a.out);
    write(a.root, "i18n/locales/en.json", '{ "hello": ');
    const next = app({ root: a.root });
    setupTypes(next.nuxt, { from: "./i18n/locales" }, "en");
    await expect(next.prepare()).rejects.toThrow(
      /^\[@comvi\/nuxt\] Cannot generate \.nuxt\/types\/comvi\.d\.ts: .*en\.json: invalid JSON/,
    );
    expect(read(a.out)).toBe(before);
  });

  it("nuxt dev: one watcher follows the catalogs, reports errors and goes on, and closes with Nuxt", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = app({ dev: true });
    setupTypes(a.nuxt, { from: "./i18n/locales" }, "en");
    await a.prepare();
    await a.prepare(); // Nuxt writes the types again in dev: still one watcher.
    expect(typegen.watch).toHaveBeenCalledTimes(1);
    expect(typegen.generate).not.toHaveBeenCalled();
    const watcher = vi.mocked(typegen.watch).mock.results[0]!.value as typegen.Watcher;
    expect(read(a.out)).toContain('"hello": { "name": string | number };');

    write(a.root, "i18n/locales/en.json", '{ "hello": ');
    await until(() => error.mock.calls.length > 0, "the reported error");
    expect(String(error.mock.calls[0]![0])).toMatch(/^\[@comvi\/nuxt\] .*en\.json/);
    expect(read(a.out)).toContain('"hello": { "name": string | number };');

    write(a.root, "i18n/locales/en.json", { hello: "Hello {name}", added: "New {fresh}" });
    await until(() => read(a.out).includes('"added": { "fresh"'), "the new key");

    expect(watcher.active).toBe(true);
    await a.call("close");
    expect(watcher.active).toBe(false);
  });
});
