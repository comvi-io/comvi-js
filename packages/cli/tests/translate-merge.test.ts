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
    await write("common/en.json", { a: "A", b: "B", c: "C", d: "D", e: "E" });
    await write("common/de.json", { b: null, c: "", d: " ", e: "Lokal" });

    const report = await merge({
      source: { common: { a: "A", b: "B", c: "C", d: "D", e: "E" } },
      targets: { de: { common: { a: "A-de", b: "B-de", c: "C-de", d: "D-de", e: "E-de" } } },
    });

    expect(await read("common/de.json")).toEqual({
      b: "B-de",
      c: "C-de",
      d: " ",
      e: "Lokal",
      a: "A-de",
    });
    expect(report.errors).toEqual([]);
    expect(report.files).toHaveLength(1);
    expect(report.files[0].filled.sort()).toEqual(["a", "b", "c"]);
    // " " and "Lokal" are values that differ from the platform's.
    expect(report.files[0].differ.sort()).toEqual(["d", "e"]);
    expect(report.files[0].missing).toEqual([]);
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

    await merge({
      source: { common: { "nav.home": "Home", "nav.about": "About", title: "T" } },
      targets: {
        de: { common: { "nav.home": "Start", "nav.about": "Über uns", title: "Titel" } },
      },
    });

    expect(await read("common/de.json")).toEqual({
      nav: { home: "Startseite", about: "Über uns" },
      title: "Titel",
    });
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

  it("reports an unreadable target file and leaves it alone", async () => {
    await write("common/en.json", { a: "A" });
    await write("common/de.json", "{ not json");

    const report = await merge({
      source: { common: { a: "A" } },
      targets: { de: { common: { a: "A-de" } } },
    });

    expect(await fs.readFile(join(dir, "common/de.json"), "utf-8")).toBe("{ not json");
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].filePath).toBe(join(dir, "common/de.json"));
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
});
