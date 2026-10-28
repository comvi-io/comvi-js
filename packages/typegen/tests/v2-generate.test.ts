/**
 * The Node API: generate() and watch() over a local directory (R3-18). Every gate here
 * COUNTS (files parsed, runs, writes); nothing measures time — the waits only wait.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generate,
  LocalSource,
  lockFileOf,
  serializeWireSchema,
  watch,
  type GenerateMessage,
  type Watcher,
} from "../src/index";

const dirs: string[] = [];
const watchers: Watcher[] = [];
afterEach(() => {
  for (const w of watchers.splice(0)) w.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** An app root with package.json (declaring @comvi/react) and catalogs under locales/. */
function app(files: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-typegen-"));
  dirs.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ dependencies: { "@comvi/react": "^0.8.0" } }),
  );
  for (const [rel, content] of Object.entries(files)) write(root, rel, content);
  return root;
}
function write(root: string, rel: string, content: unknown): void {
  const file = path.join(root, "locales", rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}
const out = (root: string) => fs.readFileSync(path.join(root, "comvi.d.ts"), "utf8");
const messages = () => {
  const list: GenerateMessage[] = [];
  return { list, onMessage: (m: GenerateMessage) => void list.push(m) };
};

const CATALOGS = {
  "en.json": { hello: "Hi {name}", terms: "<link>terms</link>", title: "Title" },
  "de.json": { hello: "Hallo {name}", terms: "<link>AGB</link>", title: "Titel" },
  "shop/en.json": { "cart.items": "{count, plural, one {# item} other {# items}}" },
  "shop/de.json": { "cart.items": "{count, plural, one {# Artikel} other {# Artikel}}" },
  "admin/en.json": { "user.role": "{role, select, admin {Admin} other {User}}" },
};

describe("generate()", () => {
  it("writes the declaration from a directory, augmenting the package the app declares", async () => {
    const root = app(CATALOGS);
    const r = await generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" });
    expect(r).toMatchObject({ written: true, stale: false, namespaces: 3, keys: 5, warnings: [] });
    expect(out(root)).toBe(r.content);
    expect(r.content).toContain("import type { Tag } from '@comvi/react';");
    expect(r.content).toContain('      "cart.items": { "count": number };');
    expect(r.content).toContain('      "user.role": { "role": "admin" | (string & {}) };');
    expect(r.content).toContain('      "terms": { "link": Tag };');
  });

  it("does not rewrite an unchanged file, and leaves no temporary file behind", async () => {
    const root = app(CATALOGS);
    await generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" });
    const before = fs.statSync(path.join(root, "comvi.d.ts")).mtimeMs;
    const rename = vi.spyOn(fs, "renameSync");
    const again = await generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" });
    expect(again.written).toBe(false);
    expect(rename).not.toHaveBeenCalled();
    expect(fs.statSync(path.join(root, "comvi.d.ts")).mtimeMs).toBe(before);
    expect(fs.readdirSync(root).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("writes through a temporary file renamed over the target (atomic)", async () => {
    const root = app(CATALOGS);
    const rename = vi.spyOn(fs, "renameSync");
    await generate({ from: "locales", out: "types/comvi.d.ts", root, sourceLocale: "en" });
    expect(rename).toHaveBeenCalledTimes(1);
    const [from, to] = rename.mock.calls[0] as [string, string];
    expect(to).toBe(path.join(root, "types/comvi.d.ts"));
    expect(path.dirname(from)).toBe(path.dirname(to));
    expect(from).toMatch(/\.tmp$/);
  });

  it("check mode writes nothing and reports staleness", async () => {
    const root = app(CATALOGS);
    const missing = await generate({
      from: "locales",
      out: "comvi.d.ts",
      root,
      sourceLocale: "en",
      check: true,
    });
    expect(missing).toMatchObject({ stale: true, written: false });
    expect(fs.existsSync(path.join(root, "comvi.d.ts"))).toBe(false);
    await generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" });
    expect(
      (
        await generate({
          from: "locales",
          out: "comvi.d.ts",
          root,
          sourceLocale: "en",
          check: true,
        })
      ).stale,
    ).toBe(false);
    write(root, "en.json", { hello: "Hi {name}", extra: "x", terms: "<link>t</link>", title: "T" });
    expect(
      (
        await generate({
          from: "locales",
          out: "comvi.d.ts",
          root,
          sourceLocale: "en",
          check: true,
        })
      ).stale,
    ).toBe(true);
  });

  it("a declaration file that exists but cannot be read is an error, never 'outdated'", async () => {
    const root = app(CATALOGS);
    fs.mkdirSync(path.join(root, "comvi.d.ts"));
    for (const check of [true, false])
      await expect(
        generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en", check }),
      ).rejects.toThrow(`Cannot read ${path.join(root, "comvi.d.ts")}: EISDIR`);
  });

  it("broken JSON: one clear error naming the file, and the old declaration stays", async () => {
    const root = app(CATALOGS);
    await generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" });
    const before = out(root);
    write(root, "shop/en.json", '{ "cart.items": "x", }');
    await expect(
      generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" }),
    ).rejects.toThrow(/shop\/en\.json: invalid JSON/);
    expect(out(root)).toBe(before);
  });

  it("a reserved param name fails generation and keeps the old file", async () => {
    const root = app(CATALOGS);
    await generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" });
    const before = out(root);
    write(root, "en.json", { hello: "Hi {locale}" });
    await expect(
      generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" }),
    ).rejects.toThrow(/\{locale\}, but `locale` is a per-call option/);
    expect(out(root)).toBe(before);
  });

  it("needs sourceLocale when the directory has several locales, not with one", async () => {
    const root = app(CATALOGS);
    await expect(generate({ from: "locales", out: "comvi.d.ts", root })).rejects.toThrow(
      "Set sourceLocale: " + path.join(root, "locales") + " has de, en",
    );
    const one = app({ "en.json": { a: "A" } });
    expect((await generate({ from: "locales", out: "comvi.d.ts", root: one })).keys).toBe(1);
  });

  it("a sourceLocale with no catalog is an error naming the locales found", async () => {
    const root = app({ "en-US.json": { a: "A" }, "de.json": { a: "B" } });
    await expect(
      generate({ from: "locales", out: "comvi.d.ts", root, sourceLocale: "en" }),
    ).rejects.toThrow(
      `sourceLocale "en" has no catalog in ${path.join(root, "locales")} (found de, en-US)`,
    );
    expect(fs.existsSync(path.join(root, "comvi.d.ts"))).toBe(false);
  });

  it("defaultParams make a param optional; nested values are reported and left out", async () => {
    const root = app({ "en.json": { hello: "Hi {name} from {brand}", nested: { a: "x" } } });
    const m = messages();
    const r = await generate({
      from: "locales",
      out: "comvi.d.ts",
      root,
      defaultParams: ["brand"],
      onMessage: m.onMessage,
    });
    expect(r.content).toContain('"hello": { "brand"?: string | number; "name": string | number };');
    expect(r.content).not.toContain('"nested"');
    expect(m.list).toEqual([
      {
        level: "warn",
        text: 'default "nested" (en): the value is not a string; catalogs are flat (flatten nested objects) — left out',
      },
    ]);
  });

  it("follows the source locale and warns about the others, as the platform does", async () => {
    const root = app({
      "en.json": { a: "{g, select, x {X} other {O}}", only: "{n}" },
      "de.json": { a: "{g, select, x {X} y {Y} other {O}}", b: "{count, plural, other {#}}" },
    });
    const r = await generate({
      from: "locales",
      out: "comvi.d.ts",
      root,
      sourceLocale: "en",
      onMessage: () => {},
    });
    expect(r.content).toContain('"a": { "g": "x" | (string & {}) };');
    expect(r.content).toContain('"b": { "count": number };');
    expect(r.warnings.map((w) => `${w.key} ${w.locale ?? ""} ${w.message}`)).toEqual([
      "a de {g} has options not in the source: y",
      "b  no en (source) message; types come from the other locales",
    ]);
  });

  it("refuses a directory app with no Comvi dependency unless augment is given", async () => {
    const root = app({ "en.json": { a: "A" } });
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    await expect(generate({ from: "locales", out: "comvi.d.ts", root })).rejects.toThrow(
      /declares none/,
    );
    const r = await generate({ from: "locales", out: "comvi.d.ts", root, augment: "@comvi/core" });
    expect(r.content).toContain("declare module '@comvi/core'");
  });
});

describe("generate() from a wire schema v2 file (`comvi pull` → .comvi/schema.json)", () => {
  it("writes the same bytes as the directory the schema was read from", async () => {
    const root = app(CATALOGS);
    const source = new LocalSource({ dir: path.join(root, "locales"), sourceLocale: "en" });
    source.refresh();
    fs.mkdirSync(path.join(root, ".comvi"));
    fs.writeFileSync(
      path.join(root, ".comvi/schema.json"),
      serializeWireSchema(source.schema().schema),
    );
    const fromDir = await generate({ from: "locales", out: "a.d.ts", root, sourceLocale: "en" });
    const fromFile = await generate({ from: ".comvi/schema.json", out: "b.d.ts", root });
    expect(fromFile.content).toBe(fromDir.content);
    expect(fromFile).toMatchObject({ written: true, namespaces: 3, keys: 5 });
  });

  it("a broken or invalid schema file fails naming the file, and keeps the old declaration", async () => {
    const root = app({});
    const file = path.join(root, "schema.json");
    fs.writeFileSync(file, JSON.stringify({ v: 2, sourceLocale: "en", namespaces: {} }));
    await generate({ from: "schema.json", out: "comvi.d.ts", root });
    const before = out(root);
    fs.writeFileSync(file, "{ nope");
    await expect(generate({ from: "schema.json", out: "comvi.d.ts", root })).rejects.toThrow(
      `${file}: invalid JSON`,
    );
    fs.writeFileSync(file, JSON.stringify({ v: 1, keys: {} }));
    await expect(generate({ from: "schema.json", out: "comvi.d.ts", root })).rejects.toThrow(
      `${file}: Invalid typegen schema v2 at v: expected 2, received 1`,
    );
    await expect(generate({ from: "missing.json", out: "comvi.d.ts", root })).rejects.toThrow(
      /missing\.json: ENOENT/,
    );
    expect(out(root)).toBe(before);
  });
});

describe("LocalSource.refresh()", () => {
  it("re-reads only the namespaces it is told, and parses only files whose text changed", () => {
    const root = app(CATALOGS);
    const source = new LocalSource({ dir: path.join(root, "locales"), sourceLocale: "en" });
    source.refresh();
    expect([source.readFiles, source.parsedFiles]).toEqual([5, 5]);
    write(root, "shop/en.json", { "cart.items": "{count, plural, other {#}}", more: "x" });
    source.refresh(["shop"]);
    // shop has two files (en, de): both read, the changed one parsed.
    expect([source.readFiles, source.parsedFiles]).toEqual([7, 6]);
    expect(Object.keys(source.schema().schema.namespaces.shop)).toEqual(["cart.items", "more"]);
    // A refresh of a namespace that did not change parses nothing.
    source.refresh(["admin"]);
    expect([source.readFiles, source.parsedFiles]).toEqual([8, 6]);
  });

  it("drops a namespace whose files are gone, and adds a new one on any refresh", () => {
    const root = app(CATALOGS);
    const source = new LocalSource({ dir: path.join(root, "locales"), sourceLocale: "en" });
    source.refresh();
    fs.rmSync(path.join(root, "locales/admin"), { recursive: true });
    write(root, "legal/en.json", { imprint: "I" });
    source.refresh([]);
    expect(Object.keys(source.schema().schema.namespaces)).toEqual(["default", "legal", "shop"]);
  });
});

// File-system events can lag under load (FSEvents, inotify): generous waits, no timing asserted.
describe("watch()", { timeout: 60_000 }, () => {
  const start = (root: string, extra: Partial<Parameters<typeof watch>[0]> = {}) => {
    const m = messages();
    const w = watch({
      from: "locales",
      out: "comvi.d.ts",
      root,
      sourceLocale: "en",
      debounceMs: 150,
      onMessage: m.onMessage,
      ...extra,
    });
    watchers.push(w);
    return { w, m };
  };
  /** Waits (no time limit asserted) until the watcher ran `n` times and is idle. */
  const afterRuns = async (w: Watcher, n: number) => {
    await vi.waitFor(() => expect(w.stats.runs).toBeGreaterThanOrEqual(n), {
      timeout: 10_000,
      interval: 20,
    });
    await w.idle();
  };

  it("re-reads ONLY the namespace whose file changed (counted files, not time)", async () => {
    const root = app(CATALOGS);
    const { w } = start(root);
    await w.ready;
    // First run: every file (5).
    expect(w.stats).toMatchObject({ runs: 1, readFiles: 5, parsedFiles: 5, writes: 1 });
    write(root, "shop/en.json", {
      "cart.items": "{count, plural, one {# item} other {# items}}",
      "cart.total": "{sum}",
    });
    await afterRuns(w, 2);
    expect(out(root)).toContain('"cart.total": { "sum": string | number };');
    // The one changed file was parsed again, nothing else — however many file-system
    // events (FSEvents replays recent history at watch start) reached the watcher.
    expect(w.stats.parsedFiles).toBe(6);
    expect(w.stats.writes).toBe(2);
  });

  it("debounces a burst of saves into one run", async () => {
    const root = app(CATALOGS);
    const { w } = start(root, { debounceMs: 400 });
    await w.ready;
    // Ten saves, each a new text, spread over ~200 ms (an editor's save-all, a git
    // checkout). Without the debounce each lands in a run of its own.
    for (let i = 0; i < 10; i++) {
      write(root, "admin/en.json", { "user.role": `{role, select, a${i} {A} other {U}}` });
      await new Promise((r) => setTimeout(r, 20));
    }
    await afterRuns(w, 2);
    // A late file-system event can split the burst once; ten saves never make ten runs.
    expect(w.stats.runs - 1).toBeLessThanOrEqual(2);
    expect(out(root)).toContain(`"role": "a9" | (string & {})`);
  });

  it("an unchanged declaration is not rewritten when a catalog changes only its text", async () => {
    const root = app(CATALOGS);
    const { w } = start(root);
    await w.ready;
    write(root, "de.json", { hello: "Servus {name}", terms: "<link>AGB</link>", title: "Titel" });
    await afterRuns(w, 2);
    expect(w.stats.writes).toBe(1);
  });

  it("broken JSON: one message for the broken state, the file stays, a fix writes again", async () => {
    const root = app(CATALOGS);
    const { w, m } = start(root);
    await w.ready;
    const before = out(root);
    write(root, "shop/en.json", '{ "cart.items": ');
    await afterRuns(w, 2);
    // Saved again, still broken the same way: no second message.
    write(root, "shop/en.json", '{ "cart.items": ');
    write(root, "admin/en.json", { "user.role": "{role, select, admin {A} other {U}}", x: "y" });
    await afterRuns(w, 3);
    const errors = m.list.filter((x) => x.level === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toMatch(/shop\/en\.json: invalid JSON .*comvi\.d\.ts is kept as it was/);
    expect(out(root)).toBe(before);
    write(root, "shop/en.json", { "cart.items": "{count, plural, other {#}}", fixed: "x" });
    await vi.waitFor(() => expect(out(root)).toContain('"fixed": never;'), {
      timeout: 10_000,
      interval: 20,
    });
  });

  it("a new namespace directory is picked up", async () => {
    const root = app(CATALOGS);
    const { w } = start(root);
    await w.ready;
    write(root, "legal/en.json", { imprint: "Imprint" });
    await vi.waitFor(() => expect(out(root)).toContain('"legal": {'), {
      timeout: 10_000,
      interval: 20,
    });
  });

  it("a save whose file-system event never arrives is generated all the same (catch-up)", async () => {
    // The OS watcher misses everything, as macOS FSEvents can just after it starts.
    const deaf = vi
      .spyOn(fs, "watch")
      .mockImplementation(() => ({ close() {}, on() {} }) as unknown as fs.FSWatcher);
    try {
      const root = app(CATALOGS);
      const { w } = start(root);
      await w.ready;
      write(root, "shop/en.json", { "cart.items": "{count, plural, other {#}}", lost: "{x}" });
      await afterRuns(w, 2);
      expect(out(root)).toContain('"lost": { "x": string | number };');
      // Only the namespace whose file differs was parsed again.
      expect(w.stats.parsedFiles).toBe(6);
    } finally {
      deaf.mockRestore();
    }
  });

  it("a batch that fails is read again whole: a namespace changed beside a broken one is not lost", async () => {
    // Deaf OS watcher: the catch-up stat pass finds both changes, in directory order —
    // `admin` (broken) before `shop` (changed), so `shop` is never read by the failed run.
    const deaf = vi
      .spyOn(fs, "watch")
      .mockImplementation(() => ({ close() {}, on() {} }) as unknown as fs.FSWatcher);
    try {
      const root = app(CATALOGS);
      const { w, m } = start(root);
      await w.ready;
      write(root, "admin/en.json", '{ "user.role": ');
      write(root, "shop/en.json", { "cart.items": "{count, plural, other {#}}", added: "{x}" });
      await vi.waitFor(() => expect(m.list.some((x) => x.level === "error")).toBe(true), {
        timeout: 10_000,
        interval: 20,
      });
      await w.idle();
      expect(out(root)).not.toContain('"added"');
      // Repairing the broken namespace alone must bring the other one's change too.
      write(root, "admin/en.json", { "user.role": "{role, select, admin {A} other {U}}" });
      await vi.waitFor(() => expect(out(root)).toContain('"added": { "x": string | number };'), {
        timeout: 10_000,
        interval: 20,
      });
    } finally {
      deaf.mockRestore();
    }
  });

  it("a directory that cannot be watched stops the watcher for good and frees the file", async () => {
    const root = app(CATALOGS);
    const broken = vi.spyOn(fs, "watch").mockImplementationOnce(() => {
      throw Object.assign(new Error("EMFILE: too many open files, watch"), { code: "EMFILE" });
    });
    try {
      const { w, m } = start(root);
      await w.ready;
      expect(m.list.filter((x) => x.level === "error").map((x) => x.text)).toEqual([
        `Cannot watch ${path.join(root, "locales")}: EMFILE: too many open files, watch`,
      ]);
      expect(w.active).toBe(false);
      // The lock is free: the next watcher of the file writes it.
      const next = start(root);
      await next.w.ready;
      expect(next.w.active).toBe(true);
      expect(out(root)).toContain('"cart.items"');
    } finally {
      broken.mockRestore();
    }
  });

  it("a watcher error after start stops the watcher for good and frees the file", async () => {
    const root = app(CATALOGS);
    // A real watcher emits 'error' when, say, its directory goes away or inotify runs out.
    const emitter = Object.assign(new EventEmitter(), { close() {} });
    const failing = vi
      .spyOn(fs, "watch")
      .mockImplementationOnce(() => emitter as unknown as fs.FSWatcher);
    try {
      const { w, m } = start(root);
      await w.ready;
      expect(w.active).toBe(true);
      emitter.emit("error", Object.assign(new Error("ENOSPC: watch limit"), { code: "ENOSPC" }));
      expect(m.list.filter((x) => x.level === "error").map((x) => x.text)).toEqual([
        `Cannot watch ${path.join(root, "locales")}: ENOSPC: watch limit`,
      ]);
      expect(w.active).toBe(false);
      const next = start(root);
      await next.w.ready;
      expect(next.w.active).toBe(true);
    } finally {
      failing.mockRestore();
    }
  });

  it("a reporter that closes the watcher is not followed by its write over the successor", async () => {
    const root = app(CATALOGS);
    const schema = (namespaces: unknown) =>
      JSON.stringify({ v: 2, sourceLocale: "en", namespaces });
    // `a` warns on every run (a select with neither options nor `other`); `b` does not.
    const warned = (key: string) => ({
      [key]: { params: { g: { kind: "select", other: false } } },
    });
    fs.mkdirSync(path.join(root, ".comvi"));
    fs.writeFileSync(path.join(root, ".comvi/a.json"), schema({ default: warned("old") }));
    fs.writeFileSync(path.join(root, ".comvi/b.json"), schema({ default: { fresh: {} } }));
    let armed = false;
    // Not armed during the first run, which runs inside `watch()` (before `a` exists).
    const a: Watcher = watch({
      from: ".comvi/a.json",
      out: "comvi.d.ts",
      root,
      debounceMs: 20,
      // The host closes the watcher from inside its warning reporter (a reloaded config).
      onMessage: (m) => {
        if (armed && m.level === "warn") a.close();
      },
    });
    watchers.push(a);
    await a.ready;
    const b = start(root, { from: ".comvi/b.json", debounceMs: 20 }).w;
    expect([a.active, b.active]).toEqual([true, false]);
    armed = true;
    fs.writeFileSync(path.join(root, ".comvi/a.json"), schema({ default: warned("stale") }));
    await vi.waitFor(() => expect(a.active).toBe(false), { timeout: 10_000, interval: 10 });
    await a.idle();
    await b.idle();
    expect(b.active).toBe(true);
    expect(out(root)).toContain('"fresh": never;');
    expect(out(root)).not.toContain('"stale"');
    expect(a.stats.writes).toBe(1);
  });

  it("follows a wire schema file before its directory exists (no `comvi pull` yet)", async () => {
    const root = app({ "en.json": { a: "A" } });
    const { w } = start(root, { from: ".comvi/schema.json" });
    await w.ready;
    const file = path.join(root, ".comvi/schema.json");
    expect(fs.existsSync(path.dirname(file))).toBe(true);
    fs.writeFileSync(
      file,
      JSON.stringify({ v: 2, sourceLocale: "en", namespaces: { default: { late: {} } } }),
    );
    await vi.waitFor(() => expect(out(root)).toContain('"late": never;'), {
      timeout: 10_000,
      interval: 20,
    });
  });

  it("follows a wire schema file, replaced as `comvi pull` replaces it", async () => {
    const root = app({});
    const file = path.join(root, ".comvi/schema.json");
    const schema = (keys: Record<string, object>) =>
      JSON.stringify({ v: 2, sourceLocale: "en", namespaces: { default: keys } });
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, schema({ a: {} }));
    const { w } = start(root, { from: ".comvi/schema.json" });
    await w.ready;
    expect(out(root)).toContain('"a": never;');
    fs.writeFileSync(`${file}.tmp`, schema({ a: {}, b: { tags: ["x"] } }));
    fs.renameSync(`${file}.tmp`, file);
    await vi.waitFor(() => expect(out(root)).toContain('"b": { "x": Tag };'), {
      timeout: 10_000,
      interval: 20,
    });
  });
});

// One writer per declaration file: a reloaded config or a second dev server in this
// process. (Another PROCESS is covered by packages/cli/e2e/typegen-local.e2e.test.ts.)
describe("watch(): two watchers of one file", { timeout: 60_000 }, () => {
  const begin = (root: string) => {
    const list: GenerateMessage[] = [];
    const w = watch({
      from: "locales",
      out: "comvi.d.ts",
      root,
      sourceLocale: "en",
      debounceMs: 100,
      onMessage: (m) => void list.push(m),
    });
    watchers.push(w);
    return { w, list };
  };

  it("the second stays idle (no read, no write) and takes over when the first closes", async () => {
    const root = app(CATALOGS);
    const a = begin(root);
    await a.w.ready;
    const b = begin(root);
    await b.w.ready;
    expect([a.w.active, b.w.active]).toEqual([true, false]);
    expect(b.w.stats).toEqual({ runs: 0, readFiles: 0, parsedFiles: 0, writes: 0 });
    expect(b.list.map((m) => m.text)).toEqual([
      "comvi.d.ts is already generated by another watcher; this one takes over when it stops",
    ]);
    write(root, "en.json", { hello: "Hi {name}", terms: "<link>t</link>", title: "T", n: "{n}" });
    await vi.waitFor(() => expect(a.w.stats.runs).toBe(2), { timeout: 10_000, interval: 20 });
    await a.w.idle();
    // One write of the change, by the writer only.
    expect(a.w.stats.writes + b.w.stats.writes).toBe(2);
    expect(b.w.stats.runs).toBe(0);
    a.w.close();
    // Handed over at once, in this process (no polling wait).
    expect(b.w.active).toBe(true);
    await b.w.ready;
    await b.w.idle();
    expect(b.list.map((m) => m.text)).toContain("took over comvi.d.ts");
    write(root, "en.json", { hello: "Hi {name}", terms: "<link>t</link>", title: "T", m: "{m}" });
    await vi.waitFor(() => expect(out(root)).toContain('"m": { "m": string | number };'), {
      timeout: 10_000,
      interval: 20,
    });
    // The takeover's first run found the file as the first writer left it: not rewritten.
    expect(b.w.stats.writes).toBe(1);
  });

  it("a lock left by a process that no longer runs is taken over", async () => {
    const root = app(CATALOGS);
    const lock = lockFileOf(path.join(root, "comvi.d.ts"));
    // A pid far above any real one: no such process.
    fs.writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 12345, token: "dead" }));
    const a = begin(root);
    await a.w.ready;
    expect(a.w.active).toBe(true);
    expect(a.w.stats.writes).toBe(1);
    a.w.close();
    expect(fs.existsSync(lock)).toBe(false);
  });
});
