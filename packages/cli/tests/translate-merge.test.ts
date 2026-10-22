import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { TranslationSync } from "../src/core/TranslationSync";
import { mergeMissing, type MergeOptions } from "../src/core/MissingMerge";
import { DEFAULT_FILE_TEMPLATE } from "../src/defaults";
import { makeTempDir, removeTempDirs } from "./helpers";

/**
 * The merge writer of `comvi translate`: platform values land only where the
 * local target is missing, and the rest of each file stays as it was.
 */
describe("mergeMissing", () => {
  let dir: string;
  let sync: TranslationSync;

  beforeEach(async () => {
    dir = await makeTempDir("comvi-merge");
    sync = new TranslationSync({
      translationsPath: dir,
      fileTemplate: DEFAULT_FILE_TEMPLATE,
      format: "json",
    });
  });

  afterEach(removeTempDirs);

  async function write(relativePath: string, content: unknown): Promise<void> {
    const filePath = join(dir, relativePath);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      typeof content === "string" ? content : JSON.stringify(content),
      "utf-8",
    );
  }

  async function read(relativePath: string): Promise<unknown> {
    return JSON.parse(await fs.readFile(join(dir, relativePath), "utf-8"));
  }

  function merge(options: Partial<MergeOptions> & Pick<MergeOptions, "source" | "targets">) {
    // "main" is the default namespace, so "common" and "admin" live in their own directories.
    return mergeMissing({ sync, defaultNamespace: "main", sourceLocale: "en", ...options });
  }

  it("fills absent, null and empty targets and never overwrites a value, whitespace included", async () => {
    await write("common/en.json", { a: "A", b: "B", c: "C", d: "D", e: "E", f: "F" });
    await write("common/de.json", { b: null, c: "", d: " ", e: "Lokal", f: "F-de" });

    const report = await merge({
      source: { common: { a: "A", b: "B", c: "C", d: "D", e: "E", f: "F" } },
      targets: {
        de: { common: { a: "A-de", b: "B-de", c: "C-de", d: "D-de", e: "E-de", f: "F-de" } },
      },
    });

    expect(await read("common/de.json")).toEqual({
      b: "B-de",
      c: "C-de",
      d: " ",
      e: "Lokal",
      f: "F-de",
      a: "A-de",
    });
    expect(report.errors).toEqual([]);
    expect(report.files).toHaveLength(1);
    expect(report.files[0].filled.sort()).toEqual(["a", "b", "c"]);
    // " " and "Lokal" are values that differ from the platform's; "F-de" is the same.
    expect(report.files[0].differ.sort()).toEqual(["d", "e"]);
    expect(report.files[0].missing).toEqual([]);
    expect(report.files[0].created).toBe(false);
  });

  it("keeps local-only keys and writes only keys of the local source catalog", async () => {
    await write("common/en.json", { greeting: "Hello" });
    await write("common/de.json", { localOnly: "Nur hier" });

    await merge({
      source: { common: { greeting: "Hello" } },
      // `extra` is on the platform but not in the local source: not written.
      targets: { de: { common: { greeting: "Hallo", extra: "Extra" } } },
    });

    expect(await read("common/de.json")).toEqual({ localOnly: "Nur hier", greeting: "Hallo" });
  });

  it("does not write a key the platform has no value for, and reports it as still missing", async () => {
    await write("common/en.json", { a: "A", b: "B" });
    await write("common/de.json", {});

    const report = await merge({
      source: { common: { a: "A", b: "B" } },
      targets: { de: { common: { a: "A-de", b: "" } } },
    });

    expect(await read("common/de.json")).toEqual({ a: "A-de" });
    expect(report.files[0].missing).toEqual(["b"]);
  });

  it("keeps a nested file nested", async () => {
    await write("common/en.json", { nav: { home: "Home", about: "About" }, title: "T" });
    await write("common/de.json", { nav: { home: "Startseite" } });

    const report = await merge({
      source: { common: { "nav.home": "Home", "nav.about": "About", title: "T" } },
      targets: {
        de: { common: { "nav.home": "Start", "nav.about": "Über uns", title: "Titel" } },
      },
    });

    expect(await read("common/de.json")).toEqual({
      nav: { home: "Startseite", about: "Über uns" },
      title: "Titel",
    });
    expect(report.files[0]).toMatchObject({ differ: ["nav.home"], collisions: [], missing: [] });
  });

  it("keeps a flat file flat", async () => {
    await write("common/en.json", { nav: { home: "Home" } });
    await write("common/de.json", { "nav.about": "Über uns" });

    await merge({
      source: { common: { "nav.home": "Home" } },
      targets: { de: { common: { "nav.home": "Start" } } },
    });

    expect(await read("common/de.json")).toEqual({ "nav.about": "Über uns", "nav.home": "Start" });
  });

  it("gives a new file the shape of the source file", async () => {
    await write("common/en.json", { nav: { home: "Home" } });
    await write("admin/en.json", { "panel.title": "Panel" });

    const report = await merge({
      source: { common: { "nav.home": "Home" }, admin: { "panel.title": "Panel" } },
      targets: { de: { common: { "nav.home": "Start" }, admin: { "panel.title": "Tafel" } } },
    });

    expect(await read("common/de.json")).toEqual({ nav: { home: "Start" } });
    expect(await read("admin/de.json")).toEqual({ "panel.title": "Tafel" });
    expect(report.files.every((file) => file.created)).toBe(true);
  });

  it("does not create a file when the platform has nothing to fill", async () => {
    await write("common/en.json", { a: "A" });

    const report = await merge({
      source: { common: { a: "A" } },
      targets: { de: { common: {} } },
    });

    await expect(fs.access(join(dir, "common/de.json"))).rejects.toThrow();
    expect(report.files[0]).toMatchObject({ filled: [], missing: ["a"], created: false });
  });

  it("reports a structural collision per key and writes the rest of the file", async () => {
    await write("common/en.json", { a: "A" });
    // `nav` is a non-empty leaf, so `nav.home` cannot nest under it; `menu` is
    // an object, so the leaf `menu` cannot replace it.
    await write("common/de.json", { nav: "Navigation", menu: { open: "Öffnen" } });

    const report = await merge({
      source: { common: { "nav.home": "Home", menu: "Menu", a: "A" } },
      targets: { de: { common: { "nav.home": "Start", menu: "Menü", a: "A-de" } } },
    });

    expect(await read("common/de.json")).toEqual({
      nav: "Navigation",
      menu: { open: "Öffnen" },
      a: "A-de",
    });
    expect(report.files[0].collisions.sort()).toEqual(["menu", "nav.home"]);
    expect(report.files[0].filled).toEqual(["a"]);
  });

  it("reads the file again at write time, so an edit made after the run started survives", async () => {
    await write("common/en.json", { a: "A", b: "B" });
    await write("common/de.json", {});
    // The file changes after the source was read and the platform answered.
    await write("common/de.json", { a: "Von Hand" });

    await merge({
      source: { common: { a: "A", b: "B" } },
      targets: { de: { common: { a: "A-de", b: "B-de" } } },
    });

    expect(await read("common/de.json")).toEqual({ a: "Von Hand", b: "B-de" });
  });

  it("writes into the local spelling of a locale and keeps prototype-named keys as data", async () => {
    await write("common/en.json", '{"__proto__":"P","constructor":"C"}');
    await write("common/pt_br.json", '{"__proto__":""}');

    await merge({
      source: { common: JSON.parse('{"__proto__":"P","constructor":"C"}') },
      targets: { pt_br: { common: JSON.parse('{"__proto__":"P-br","constructor":"C-br"}') } },
    });

    const text = await fs.readFile(join(dir, "common/pt_br.json"), "utf-8");
    expect(text).toBe('{\n  "__proto__": "P-br",\n  "constructor": "C-br"\n}\n');
    expect(Object.prototype).not.toHaveProperty("constructor", "C-br");
  });
  it("does not count an empty source value as missing, and skips a namespace the platform lacks", async () => {
    await write("common/en.json", { a: "A", blank: "" });
    await write("admin/en.json", { b: "B" });

    const report = await merge({
      source: { common: { a: "A", blank: "" }, admin: { b: "B" } },
      // Nothing for `admin` came back at all.
      targets: { de: { common: {} } },
    });

    expect(report.errors).toEqual([]);
    expect(report.files.map(({ namespace, missing }) => [namespace, missing])).toEqual([
      ["common", ["a"]],
      ["admin", ["b"]],
    ]);
  });

  it("lets an empty leaf give way to an object, and keeps that object from a later leaf", async () => {
    await write("common/en.json", { a: "A" });
    await write("common/de.json", { nav: { main: "" }, footer: { text: "Fuß" } });

    const report = await merge({
      source: { common: { "nav.main.home": "Home", "nav.main": "Main" } },
      targets: { de: { common: { "nav.main.home": "Start", "nav.main": "Haupt" } } },
    });

    expect(await read("common/de.json")).toEqual({
      nav: { main: { home: "Start" } },
      footer: { text: "Fuß" },
    });
    expect(report.files[0]).toMatchObject({
      filled: ["nav.main.home"],
      collisions: ["nav.main"],
    });
  });

  it("replaces an empty top-level leaf with the whole new branch", async () => {
    await write("common/en.json", { a: "A" });
    await write("common/de.json", { nav: "", footer: { text: "Fuß" } });

    const report = await merge({
      source: { common: { "nav.main.home": "Home", nav: "Nav" } },
      targets: { de: { common: { "nav.main.home": "Start", nav: "Navigation" } } },
    });

    expect(await read("common/de.json")).toEqual({
      nav: { main: { home: "Start" } },
      footer: { text: "Fuß" },
    });
    expect(report.files[0]).toMatchObject({ filled: ["nav.main.home"], collisions: ["nav"] });
  });

  it("writes a new file flat when there is no source file to copy the shape from", async () => {
    const report = await merge({
      source: { common: { "nav.home": "Home" } },
      targets: { de: { common: { "nav.home": "Start" } } },
    });

    expect(report.errors).toEqual([]);
    expect(await read("common/de.json")).toEqual({ "nav.home": "Start" });
  });

  it("nests a new file when the source file nests anywhere", async () => {
    await write("common/en.json", { title: "T", nav: { home: "Home" } });

    await merge({
      source: { common: { title: "T", "nav.home": "Home" } },
      targets: { de: { common: { title: "Titel", "nav.home": "Start" } } },
    });

    expect(await read("common/de.json")).toEqual({ title: "Titel", nav: { home: "Start" } });
  });

  it.each([
    ["not JSON", "{ nope", "Invalid JSON"],
    ["not an object", "[1, 2]", "expected a JSON object"],
    ["a number leaf", '{"a": 5}', 'key "a" is not a string'],
    ["a key both flat and nested", '{"x.y": "1", "x": {"y": "2"}}', "Duplicate translation key"],
  ])("reports a target file that is %s and leaves it alone", async (_what, content, message) => {
    await write("common/en.json", { a: "A" });
    await write("common/de.json", content);

    const report = await merge({
      source: { common: { a: "A" } },
      targets: { de: { common: { a: "A-de" } } },
    });

    expect(await fs.readFile(join(dir, "common/de.json"), "utf-8")).toBe(content);
    expect(report.files).toEqual([]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ locale: "de", namespace: "common" });
    expect(report.errors[0].message).toContain(message);
  });

  // Root reads any file, so the permission cannot make it unreadable there.
  it.skipIf(process.getuid?.() === 0)(
    "reports a target file it cannot read, and never replaces it as if it were new",
    async () => {
      await write("common/en.json", { a: "A" });
      await write("common/de.json", { a: "Geheim" });
      await fs.chmod(join(dir, "common/de.json"), 0o000);

      const report = await merge({
        source: { common: { a: "A" } },
        targets: { de: { common: { a: "A-de" } } },
      });

      await fs.chmod(join(dir, "common/de.json"), 0o644);
      expect(await read("common/de.json")).toEqual({ a: "Geheim" });
      expect(report.files).toEqual([]);
      expect(report.errors[0].message).toContain("EACCES");
    },
  );
});
