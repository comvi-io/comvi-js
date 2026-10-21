import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import { dirname, join, resolve } from "path";
import { createCheckCommand } from "../src/commands/check";
import { TranslationSync } from "../src/core/TranslationSync";
import { CatalogCheck } from "../src/core/CatalogCheck";
import {
  captureConsole,
  makeTempDir,
  removeTempDirs,
  stubProcessExit,
  type ConsoleCapture,
} from "./helpers";

/**
 * The command runs end to end over catalogs in a temp project: a real reader,
 * a real ConfigLoader, no network. `process.exit` is the observed result.
 */

const HOLLAMA_SHAPE = resolve(__dirname, "fixtures/check/hollama-shape");

describe("comvi check", () => {
  let dir: string;
  let output: ConsoleCapture;
  let progress: string[];

  const write = async (path: string, content: unknown) => {
    await fs.mkdir(dirname(join(dir, path)), { recursive: true });
    await fs.writeFile(
      join(dir, path),
      typeof content === "string" ? content : JSON.stringify(content),
    );
  };

  /**
   * Runs `comvi check <args>` and returns the exit code. The exit stub is
   * renewed per run: it keeps the first code it sees, and a test may run the
   * command more than once.
   */
  const run = async (...args: string[]): Promise<number> => {
    stubProcessExit();
    try {
      await createCheckCommand().parseAsync(args, { from: "user" });
    } catch (error) {
      return (error as { exitCode: number }).exitCode;
    }
    throw new Error("comvi check returned without calling process.exit");
  };

  beforeEach(async () => {
    dir = await makeTempDir("comvi-check");
    await write("package.json", { name: "app" });
    await write("src/locales/en.json", { hello: "Hello {name}", bye: "Bye" });
    await write("src/locales/de.json", { hello: "Hallo {name}", bye: "Tschüss" });
    // Not `process.chdir`: Stryker runs tests in worker threads, which refuse it.
    vi.spyOn(process, "cwd").mockReturnValue(dir);

    vi.stubEnv("COMVI_API_KEY", undefined);
    vi.stubEnv("COMVI_API_BASE_URL", undefined);
    progress = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      progress.push(String(chunk));
      return true;
    });
    vi.stubGlobal("fetch", () => {
      throw new Error("check must not use the network");
    });
    output = captureConsole();
  });

  afterEach(async () => {
    await removeTempDirs();
  });

  describe("exit 0 and 1", () => {
    it("exits 0 on clean catalogs with no .comvirc.json in the project", async () => {
      expect(await run()).toBe(0);
      expect(output.stdout).toContain("comvi check  ./src/locales  source=en  2 locales  2 keys");
      expect(output.stdout).toContain("de  ok");
      expect(output.stdout).toContain("✓ no findings — exit 0");
      expect(output.stderr).toBe("");
      expect(progress.join("")).toContain("Reading ./src/locales");
    });

    it("exits 1 on findings and prints each one", async () => {
      await write("src/locales/de.json", { hello: "Hallo", old: "Alt" });

      expect(await run()).toBe(1);
      expect(output.stdout).toContain("de  1 missing, 1 stale, 1 params");
      expect(output.stdout).toContain("missing  de:bye");
      expect(output.stdout).toContain("stale  de:old");
      expect(output.stdout).toContain("params  de:hello  source {name}  target {}");
      expect(output.stdout).toContain("✗ 1 missing, 1 stale, 1 params — exit 1");
    });

    it("--no-fail exits 0 with findings", async () => {
      await write("src/locales/de.json", { hello: "Hallo {name}" });

      expect(await run("--no-fail")).toBe(0);
      expect(output.stdout).toContain("✗ 1 missing — exit 0 (--no-fail)");
    });

    it("exits 0 on warnings alone", async () => {
      await write("src/locales/de.json", { hello: "Hallo {name}", bye: "B", old: "Alt" });

      expect(await run()).toBe(0);
      expect(output.stdout).toContain("✓ 1 stale — exit 0");
    });

    it("--strict makes a stale key exit 1", async () => {
      await write("src/locales/de.json", { hello: "Hallo {name}", bye: "B", old: "Alt" });

      expect(await run("--strict")).toBe(1);
    });

    it("check.strict in .comvirc.json makes a stale key exit 1", async () => {
      await write(".comvirc.json", { check: { strict: true } });
      await write("src/locales/de.json", { hello: "Hallo {name}", bye: "B", old: "Alt" });

      expect(await run()).toBe(1);
    });

    it("--identical reports untranslated copies; check.identical turns it on from the config", async () => {
      await write("src/locales/de.json", { hello: "Hallo {name}", bye: "Bye" });

      expect(await run("--identical", "--format", "json")).toBe(0);
      expect(JSON.parse(output.stdout).locales.de.identical).toEqual(["bye"]);

      output.log.length = 0;
      await write(".comvirc.json", { check: { identical: true } });
      expect(await run("--format", "json")).toBe(0);
      expect(JSON.parse(output.stdout).locales.de.identical).toEqual(["bye"]);

      output.log.length = 0;
      expect(await run()).toBe(0);
      expect(output.stdout).toContain("identical  de:bye");
    });

    it("-l de reads the source too but reports only de", async () => {
      await write("src/locales/de.json", { hello: "Hallo {name}" });
      await write("src/locales/fr.json", {});

      expect(await run("-l", "de", "--format", "json")).toBe(1);
      const report = JSON.parse(output.stdout);
      expect(Object.keys(report.locales)).toEqual(["de"]);
      expect(report.locales.de.missing).toEqual(["bye"]);
    });

    it("-l de does not read the catalogs of other locales", async () => {
      await write("src/locales/fr.json", "{ broken");

      expect(await run("-l", "de")).toBe(0);
    });

    it("-l de,de reports de once", async () => {
      await write("src/locales/de.json", { hello: "Hallo {name}" });

      expect(await run("-l", "de,de", "--format", "json")).toBe(1);
      const report = JSON.parse(output.stdout);
      expect(Object.keys(report.locales)).toEqual(["de"]);
      expect(report.summary.missing).toBe(1);
    });

    it("-n default,default counts each key once", async () => {
      expect(await run("-n", "default,default", "--format", "json")).toBe(0);
      expect(JSON.parse(output.stdout).keys).toBe(2);
    });

    it("matches -l and --source ignoring case and _ versus -, reporting the file's name", async () => {
      await write("src/locales/pt-br.json", { hello: "Olá {name}" });

      expect(await run("-l", "PT_br", "-s", "EN", "--format", "json")).toBe(1);
      const report = JSON.parse(output.stdout);
      expect(report.source.locale).toBe("en");
      expect(Object.keys(report.locales)).toEqual(["pt-br"]);
      expect(report.locales["pt-br"].missing).toEqual(["bye"]);
    });

    it("exits 4 when the source name matches two catalogs", async () => {
      // Hyphen versus underscore, not case: macOS file systems fold case.
      await write("src/locales/en-US.json", { hello: "Hello {name}", bye: "Bye" });
      await write("src/locales/en_us.json", { hello: "Hello {name}", bye: "Bye" });

      expect(await run("-s", "en-us")).toBe(4);
      expect(output.stderr).toMatch(
        /the source locale "en-us" matches more than one catalog: (en-US, en_us|en_us, en-US)$/m,
      );
    });

    it("checks the source alone with -l naming only the source", async () => {
      await write("src/locales/en.json", { hello: "", bye: "Bye" });

      expect(await run("-l", "en", "--format", "json")).toBe(1);
      const report = JSON.parse(output.stdout);
      expect(report.locales).toEqual({});
      expect(report.source.emptySource).toEqual(["hello"]);
    });

    it("checks the source alone when it is the only catalog", async () => {
      await fs.rm(join(dir, "src/locales/de.json"));
      await write("src/locales/en.json", { hello: "{p, number}" });

      expect(await run("--format", "json")).toBe(1);
      expect(JSON.parse(output.stdout).source.unsupportedIcu).toEqual([
        { key: "hello", argumentType: "number" },
      ]);
    });

    it("reports a locale file named __proto__", async () => {
      await write("src/locales/__proto__.json", { hello: "x {name}", bye: "y" });

      expect(await run("--format", "json")).toBe(0);
      expect(Object.keys(JSON.parse(output.stdout).locales)).toEqual(["__proto__", "de"]);
    });

    it("-l naming only the source reports no locale", async () => {
      await write("src/locales/fr.json", {});

      expect(await run("-l", "en", "--format", "json")).toBe(0);
      expect(JSON.parse(output.stdout).locales).toEqual({});
    });

    it("takes the locale filter from .comvirc.json when no flag is given", async () => {
      await write(".comvirc.json", { locales: ["de"] });
      await write("src/locales/fr.json", {});

      expect(await run("--format", "json")).toBe(0);
      expect(Object.keys(JSON.parse(output.stdout).locales)).toEqual(["de"]);
    });

    it("-n checks only the listed namespaces", async () => {
      await write("src/locales/admin/en.json", { title: "Admin" });
      await write("src/locales/admin/de.json", {});

      expect(await run("-n", "default", "--format", "json")).toBe(0);
      expect(JSON.parse(output.stdout).keys).toBe(2);

      output.log.length = 0;
      expect(await run("--format", "json")).toBe(1);
      expect(JSON.parse(output.stdout).locales.de.missing).toEqual(["admin:title"]);
    });
  });

  describe("source locale", () => {
    it("--source picks the source", async () => {
      await write("src/locales/de.json", { hello: "Hallo {name}", bye: "B", extra: "E" });

      expect(await run("-s", "de", "--format", "json")).toBe(1);
      const report = JSON.parse(output.stdout);
      expect(report.source.locale).toBe("de");
      expect(report.locales.en.missing).toEqual(["extra"]);
    });

    it("--source is trimmed", async () => {
      expect(await run("-s", " de ", "--format", "json")).toBe(0);
      expect(JSON.parse(output.stdout).source.locale).toBe("de");
    });

    it("sourceLocale in .comvirc.json is trimmed", async () => {
      await write(".comvirc.json", { sourceLocale: " de " });

      expect(await run("--format", "json")).toBe(0);
      expect(JSON.parse(output.stdout).source.locale).toBe("de");
    });

    it("sourceLocale in .comvirc.json picks the source", async () => {
      await write(".comvirc.json", { sourceLocale: "de" });

      expect(await run("--format", "json")).toBe(0);
      expect(JSON.parse(output.stdout).source.locale).toBe("de");
    });

    it("exits 4 when no source is named and there is no en catalog", async () => {
      await fs.rm(join(dir, "src/locales/en.json"));

      expect(await run()).toBe(4);
      expect(output.stderr).toContain('no catalog for "en"');
      expect(output.stderr).toContain("--source");
    });

    it("exits 4 when the named source has no catalog", async () => {
      expect(await run("-s", "fr")).toBe(4);
      expect(output.stderr).toContain('no catalog for the source locale "fr"');
    });

    it("exits 4 when the translations directory does not exist", async () => {
      expect(await run("-p", "nowhere")).toBe(4);
    });
  });

  describe("exit 4: the user's input", () => {
    it("on a translation file that is not JSON", async () => {
      await write("src/locales/de.json", "{ not json");

      expect(await run()).toBe(4);
      expect(output.stderr).toContain("Invalid JSON");
    });

    it("on two files for the same locale and namespace", async () => {
      await write("src/locales/default/en.json", { bye: "Bye" });

      expect(await run()).toBe(4);
      expect(output.stderr).toContain("Duplicate translation files");
    });

    it("on a non-string leaf", async () => {
      await write("src/locales/de.json", { hello: 5 });

      expect(await run()).toBe(4);
      expect(output.stderr).toContain('key "hello" is a number');
    });

    it("on an invalid --format value", async () => {
      expect(await run("--format", "yaml")).toBe(4);
      expect(output.stderr).toContain('--format must be "text" or "json", received "yaml"');
    });

    it.each(["-s", "-l", "-n"])("on an empty %s list", async (flag) => {
      expect(await run(flag, " , ")).toBe(4);
      expect(output.stderr).toContain("must not be empty");
    });

    it("on a locale the catalogs do not have", async () => {
      expect(await run("-l", "dee")).toBe(4);
      expect(output.stderr).toContain("Unknown locales: dee");
    });

    it("on a namespace the catalogs do not have", async () => {
      expect(await run("-n", "nope")).toBe(4);
      expect(output.stderr).toContain("Unknown namespaces: nope");
    });

    it("on --config naming a file that does not exist", async () => {
      expect(await run("--config", "missing.json")).toBe(4);
      expect(output.stderr).toContain("Config file not found");
    });

    it("on a .comvirc.json with an unknown field", async () => {
      await write(".comvirc.json", { languages: ["de"] });

      expect(await run()).toBe(4);
      expect(output.stderr).toContain('field "languages" is not an option');
    });

    it.each([
      "{namespace}.json",
      "{languageTag}/{languageTag}.json",
      "{namespace}/{namespace}/{languageTag}.json",
      "{languageTag}.yaml",
    ])("on --file-template %j", async (template) => {
      expect(await run("--file-template", template)).toBe(4);
      expect(output.stderr).toContain("--file-template must contain one {languageTag}");
    });

    it("on a translation file that vanished after the directory was listed", async () => {
      const { TypegenError, ErrorCodes } = await import("../src/utils/errors");
      const cause = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      vi.spyOn(TranslationSync.prototype, "readTranslations").mockRejectedValue(
        new TypegenError("Failed to read de.json", ErrorCodes.FS_READ_FAILED, cause),
      );

      expect(await run()).toBe(4);
    });

    it("on --path naming a file instead of a directory", async () => {
      expect(await run("-p", "src/locales/en.json")).toBe(4);
      expect(output.stderr).toContain("✗ Check failed:");
    });

    it("on a translation file it may not read", async () => {
      if (process.platform === "win32" || process.getuid?.() === 0) return;
      await fs.chmod(join(dir, "src/locales/de.json"), 0o000);

      expect(await run()).toBe(4);
      expect(output.stderr).toContain("Failed to read");
    });
  });

  describe("exit 2: the check could not run", () => {
    it("on a translations directory it may not list", async () => {
      if (process.platform === "win32" || process.getuid?.() === 0) return;
      await fs.chmod(join(dir, "src/locales"), 0o000);
      try {
        expect(await run()).toBe(2);
        expect(output.stderr).toContain("✗ Check failed:");
      } finally {
        await fs.chmod(join(dir, "src/locales"), 0o755);
      }
    });

    it("on a read failure that is not a missing or forbidden file", async () => {
      const failure = Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
      vi.spyOn(TranslationSync.prototype, "readTranslations").mockRejectedValue(failure);

      expect(await run()).toBe(2);
      expect(output.stderr).toContain("EIO: i/o error");
    });

    it("on a file read wrapped as FS_READ_FAILED with another errno", async () => {
      const { TypegenError, ErrorCodes } = await import("../src/utils/errors");
      const cause = Object.assign(new Error("EIO"), { code: "EIO" });
      vi.spyOn(TranslationSync.prototype, "readTranslations").mockRejectedValue(
        new TypegenError("Failed to read x", ErrorCodes.FS_READ_FAILED, cause),
      );

      expect(await run()).toBe(2);
    });

    it("on FS_READ_FAILED with no cause", async () => {
      const { TypegenError, ErrorCodes } = await import("../src/utils/errors");
      vi.spyOn(TranslationSync.prototype, "readTranslations").mockRejectedValue(
        new TypegenError("Failed to read x", ErrorCodes.FS_READ_FAILED),
      );

      expect(await run()).toBe(2);
    });

    it("on another error code even with a missing-file cause", async () => {
      const { TypegenError, ErrorCodes } = await import("../src/utils/errors");
      const cause = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      vi.spyOn(TranslationSync.prototype, "readTranslations").mockRejectedValue(
        new TypegenError("x", ErrorCodes.FS_MKDIR_FAILED, cause),
      );

      expect(await run()).toBe(2);
    });

    it("when the check itself throws", async () => {
      vi.spyOn(CatalogCheck, "run").mockImplementation(() => {
        throw new Error("engine bug");
      });

      expect(await run()).toBe(2);
      expect(output.stderr).toContain("✗ Check failed: engine bug");
    });

    it("on a non-Error rejection", async () => {
      vi.spyOn(TranslationSync.prototype, "readTranslations").mockRejectedValue("boom");

      expect(await run()).toBe(2);
      expect(output.stderr).toContain("✗ Check failed: boom");
    });
  });

  describe("offline", () => {
    it("runs with a .comvirc.json that has no apiKey", async () => {
      await write(".comvirc.json", { translationsPath: "./src/locales" });

      expect(await run()).toBe(0);
    });

    it("never touches COMVI_API_KEY or COMVI_API_BASE_URL", async () => {
      await write(".comvirc.json", {});
      const touched: string[] = [];
      const realEnv = process.env;
      process.env = new Proxy(realEnv, {
        get(target, name, receiver) {
          if (name === "COMVI_API_KEY" || name === "COMVI_API_BASE_URL") touched.push(name);
          return Reflect.get(target, name, receiver);
        },
        has(target, name) {
          if (name === "COMVI_API_KEY" || name === "COMVI_API_BASE_URL") touched.push(name);
          return Reflect.has(target, name);
        },
      });
      try {
        expect(await run()).toBe(0);
      } finally {
        process.env = realEnv;
      }
      expect(touched).toEqual([]);
    });

    it("never reads COMVI_API_KEY or COMVI_API_BASE_URL, even malformed", async () => {
      vi.stubEnv("COMVI_API_KEY", "garbage");
      vi.stubEnv("COMVI_API_BASE_URL", "not a url");
      await write(".comvirc.json", {});

      expect(await run()).toBe(0);
    });
  });

  describe("paths and templates", () => {
    it("-p overrides translationsPath from the config", async () => {
      await write(".comvirc.json", { translationsPath: "./elsewhere" });

      expect(await run("-p", "src/locales")).toBe(0);
    });

    it("reads translationsPath and fileTemplate from the config", async () => {
      await write(".comvirc.json", {
        translationsPath: "./cat",
        fileTemplate: "{languageTag}/{namespace}.json",
      });
      await write("cat/en/app.json", { a: "A" });
      await write("cat/de/app.json", {});

      expect(await run("--format", "json")).toBe(1);
      const report = JSON.parse(output.stdout);
      expect(report.translationsPath).toBe("./cat");
      expect(report.fileTemplate).toBe("{languageTag}/{namespace}.json");
      expect(report.locales.de.missing).toEqual(["app:a"]);
    });

    it("--file-template without {namespace} reads one catalog per locale with plain keys (COM-191)", async () => {
      await write("i18n/en.json", { greeting: "Hi {name}", nav: { home: "Home" } });
      await write("i18n/de.json", { greeting: "Hallo" });

      expect(
        await run("-p", "i18n", "--file-template", "{languageTag}.json", "--format", "json"),
      ).toBe(1);
      const report = JSON.parse(output.stdout);
      expect(report.keys).toBe(2);
      expect(report.locales.de.missing).toEqual(["nav.home"]);
      expect(report.locales.de.params).toEqual([{ key: "greeting", source: ["name"], target: [] }]);
      expect(output.stdout).not.toContain("undefined");
    });

    it("reads a fileTemplate without {namespace} from .comvirc.json", async () => {
      await write(".comvirc.json", {
        translationsPath: "./i18n",
        fileTemplate: "{languageTag}.json",
      });
      await write("i18n/en.json", { a: "A" });
      await write("i18n/de.json", {});

      expect(await run("--format", "json")).toBe(1);
      expect(JSON.parse(output.stdout).locales.de.missing).toEqual(["a"]);
    });

    it("accepts a template ending in .{extension}", async () => {
      await write("cat/en/app.json", { a: "A" });
      await write("cat/de/app.json", { a: "B" });

      expect(
        await run("-p", "cat", "--file-template", "{languageTag}/{namespace}.{extension}"),
      ).toBe(0);
      expect(output.stdout).toContain("1 keys");
    });

    it("--file-template with a prefix and no {namespace}", async () => {
      await write("i18n/messages.en.json", { a: "A" });
      await write("i18n/messages.de.json", { a: "A2" });

      expect(await run("-p", "i18n", "--file-template", "messages.{languageTag}.json")).toBe(0);
      expect(output.stdout).toContain("2 locales  1 keys");
    });
  });

  describe("output", () => {
    it("--format json is version 1 with a stable key order", async () => {
      await write("src/locales/de.json", { hello: "Hallo", old: "Alt" });

      expect(await run("--format", "json")).toBe(1);
      const report = JSON.parse(output.stdout);
      const emptyLocale = {
        missing: [],
        stale: [],
        params: [],
        plural: [],
        select: [],
        tags: [],
        unbalancedTags: [],
        unsupportedIcu: [],
        identical: [],
        localeUnknown: false,
      };
      expect(report).toEqual({
        version: 1,
        source: { locale: "en", emptySource: [], unbalancedTags: [], unsupportedIcu: [] },
        translationsPath: "./src/locales",
        fileTemplate: "{namespace}/{languageTag}.json",
        keys: 2,
        locales: {
          de: {
            ...emptyLocale,
            missing: ["bye"],
            stale: ["old"],
            params: [{ key: "hello", source: ["name"], target: [] }],
          },
        },
        summary: {
          missing: 1,
          stale: 1,
          emptySource: 0,
          params: 1,
          plural: 0,
          select: 0,
          tags: 0,
          unbalancedTags: 0,
          unsupportedIcu: 0,
          identical: 0,
        },
        errors: 2,
        warnings: 1,
        ok: false,
      });
      expect(Object.keys(report)).toEqual([
        "version",
        "source",
        "translationsPath",
        "fileTemplate",
        "keys",
        "locales",
        "summary",
        "errors",
        "warnings",
        "ok",
      ]);
      expect(Object.keys(report.locales.de)).toEqual(Object.keys(emptyLocale));
      expect(Object.keys(report.source)).toEqual([
        "locale",
        "emptySource",
        "unbalancedTags",
        "unsupportedIcu",
      ]);
      expect(output.stdout).toBe(JSON.stringify(report, null, 2));
    });

    it("prints a detail line for every rule", async () => {
      await write("src/locales/en.json", {
        e: "",
        p: "{n, plural, one {#} other {#}}",
        s: "{g, select, a {A} other {B}}",
        t: "<b>x</b>",
        u: "<i>x",
        v: "x",
        x: "{p, number}",
        y: "{p}",
      });
      await write("src/locales/de.json", {
        v: "<b>x",
        y: "{p, time}",
        p: "{n, plural, one {#} few {#}}",
        s: "{g, select, other {B}}",
        t: "x",
        u: "<i>x</i>",
        x: "{p}",
      });

      expect(await run()).toBe(1);
      for (const line of [
        "empty source  en:e",
        "plural  de:p  {n} missing-other other",
        "plural  de:p  {n} invalid-selector few",
        "select  de:s  {g}  source {a, other}  target {other}",
        "tags  de:t  source {b}  target {}",
        "unbalanced tags  en:u  {i}",
        "unsupported ICU  en:x  number",
        "unbalanced tags  de:v  {b}",
        "unsupported ICU  de:y  time",
      ]) {
        expect(output.stdout).toContain(line);
      }
    });

    it("prints exactly the summary, the details and the verdict", async () => {
      await write("src/locales/de.json", {
        hello: "Hallo",
        bye: "{n, plural, one {#} few {#} many {#}}",
        old: "Alt",
      });
      await write("src/locales/en.json", {
        hello: "Hello {name}",
        bye: "{n, plural, one {#} other {#}}",
      });

      expect(await run("--no-fail")).toBe(0);
      expect(output.stdout).toBe(
        [
          "comvi check  ./src/locales  source=en  2 locales  2 keys",
          "en  source: ok",
          "de  1 stale, 1 params, 2 plural",
          "stale  de:old",
          "params  de:hello  source {name}  target {}",
          "plural  de:bye  {n} missing-other other",
          "plural  de:bye  {n} invalid-selector few, many",
          "✗ 1 stale, 1 params, 2 plural — exit 0 (--no-fail)",
        ].join("\n"),
      );
    });

    it("prints a clean run without a --no-fail note", async () => {
      expect(await run("--no-fail")).toBe(0);
      expect(output.stdout.split("\n").at(-1)).toBe("✓ no findings — exit 0");
    });

    it("is named check", () => {
      expect(createCheckCommand().name()).toBe("check");
    });

    it("names every rule in the per-locale and the final line", async () => {
      await write("src/locales/en.json", {
        e: "",
        m: "M",
        p: "{n, plural, one {#} other {#}}",
        q: "{v, number}",
        s: "{g, select, a {A} other {B}}",
        t: "<b>x</b>",
        u: "<i>x",
        w: "{w}",
        z: "Same",
      });
      await write("src/locales/de.json", {
        old: "Alt",
        p: "{n, plural, one {#}}",
        q: "{v}",
        s: "{g, select, other {B}}",
        t: "x",
        u: "<i>x</i>",
        w: "{v}",
        z: "Same",
      });

      expect(await run("--identical")).toBe(1);
      const counts =
        "1 missing, 1 stale, 1 empty source, 1 params, 1 plural, 1 select, 1 tags, 1 unbalanced tags, 1 unsupported ICU, 1 identical";
      expect(output.stdout).toContain(
        "\nen  source: 1 empty source, 1 unbalanced tags, 1 unsupported ICU\n",
      );
      expect(output.stdout).toContain(
        "\nde  1 missing, 1 stale, 1 params, 1 plural, 1 select, 1 tags, 1 identical\n",
      );
      expect(output.stdout.split("\n").at(-1)).toBe(`✗ ${counts} — exit 1`);
    });

    it("describes every option in --help", () => {
      const help = createCheckCommand().helpInformation();

      for (const line of [
        "Validate local translation catalogs against the source locale (offline)",
        "Path to .comvirc.json file (optional for check)",
        "Translations directory",
        "File template, e.g. {languageTag}.json",
        "Source locale (default: sourceLocale, else en)",
        "Check only these locales (comma-separated)",
        "Check only these namespaces (comma-separated)",
        "Output format: text or json",
        'default: "text"',
        "Warn when a translation equals its source",
        "Exit 0 even when there are findings",
        "Fail on warnings too",
      ]) {
        expect(help).toContain(line);
      }
    });

    it("names a locale Intl does not know", async () => {
      await write("src/locales/qq.json", { hello: "{name}", bye: "x" });

      expect(await run()).toBe(0);
      expect(output.stdout).toContain("qq  ok (no Intl plural rules: only `other` checked)");
    });

    it("pads the locale column to the longest locale", async () => {
      await write("src/locales/pt-br.json", { hello: "Olá {name}", bye: "Tchau" });

      expect(await run()).toBe(0);
      expect(output.stdout).toContain("\nde     ok\npt-br  ok");
      expect(output.stdout).toContain("3 locales");
    });
  });

  describe("hollama-shape fixture (invented keys)", () => {
    it("reports missing, stale and params per locale", async () => {
      expect(await run("-p", HOLLAMA_SHAPE, "--format", "json")).toBe(1);
      const report = JSON.parse(output.stdout);

      expect(report.keys).toBe(20);
      expect(report.locales.de.missing).toEqual([
        "emptyHistory",
        "exportData",
        "importData",
        "reloadPage",
      ]);
      expect(report.locales.de.stale).toEqual(["removedOption"]);
      expect(report.locales.de.params).toEqual([
        { key: "downloadFinished", source: ["model"], target: [] },
      ]);
      expect(report.locales.fr.missing).toEqual(["theme"]);
      expect(report.locales.fr.stale).toEqual(["oldKey", "olderKey"]);
      expect(report.summary).toMatchObject({ missing: 5, stale: 3, params: 1 });
      expect(report.errors).toBe(6);
      expect(report.warnings).toBe(3);
    });
  });
});
