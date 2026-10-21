import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import { createInitCommand } from "../src/commands/init";
import { createPullCommand } from "../src/commands/pull";
import { createPushCommand } from "../src/commands/push";
import { createTypegenCommand } from "../src/commands/generate-types";
import {
  assertNoUnexpectedRequests,
  captureConsole,
  ExitSignal,
  makeTempDir,
  removeTempDirs,
  stubFetch,
  stubProcessExit,
  type ConsoleCapture,
  type FetchCapture,
  type ProcessExitCapture,
  type Routes,
} from "./helpers";

/**
 * One scheme for every command, so CI can act on the code alone:
 *   0 ok · 1 conflict or mismatch · 2 platform unavailable (retry) ·
 *   3 key rejected or access denied · 4 invalid input or usage.
 */

const PROJECT_ID = 7;
const PATHS = {
  project: "/v1/project",
  projectLocales: "/v1/project/locales",
  namespaces: `/v1/projects/${PROJECT_ID}/namespaces`,
  translations: "/v1/translations",
  schema: `/v1/projects/${PROJECT_ID}/schema`,
  commit: `/v1/projects/${PROJECT_ID}/import/commit`,
} as const;

const BASE: Routes = {
  [PATHS.project]: { body: { id: PROJECT_ID, name: "Acme" } },
  [PATHS.projectLocales]: {
    body: { sourceLocale: "en", locales: [{ code: "en" }, { code: "pt-BR" }] },
  },
  [PATHS.namespaces]: { body: [{ namespace: "common", isDefault: true }] },
};

const COMMIT_OK = {
  body: {
    success: true,
    stats: {
      keysCreated: 1,
      keysUpdated: 0,
      keysDeleted: 0,
      translationsCreated: 1,
      translationsUpdated: 0,
      translationsSkipped: 0,
      namespacesCreated: [],
      skippedLocales: [],
    },
  },
};

const TRANSLATIONS_OK = {
  body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hello" } } } },
};

let root: string;
let exits: ProcessExitCapture;
let output: ConsoleCapture;
let http: FetchCapture;

async function write(relativePath: string, content: unknown): Promise<void> {
  const target = join(root, relativePath);
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.writeFile(target, typeof content === "string" ? content : JSON.stringify(content));
}

async function run(command: Command, args: string[]): Promise<number> {
  try {
    await command.parseAsync(args, { from: "user" });
  } catch (error) {
    if (!(error instanceof ExitSignal)) throw error;
  }
  expect(exits.codes.length).toBeGreaterThan(0);
  return exits.codes[0];
}

beforeEach(async () => {
  vi.stubEnv("COMVI_API_KEY", "test-key");
  vi.stubEnv("COMVI_API_BASE_URL", "");
  vi.stubEnv("COMVI_TIMEOUT_MS", "");
  exits = stubProcessExit();
  output = captureConsole();
  root = await fs.realpath(await makeTempDir("comvi-exit-codes"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  await write(".comvirc.json", {
    apiBaseUrl: "https://api.test.com",
    translationsPath: "./locales",
    outputPath: "./types/i18n.d.ts",
    augment: "@comvi/core",
  });
});

afterEach(async () => {
  await removeTempDirs();
  assertNoUnexpectedRequests();
});

describe("pull", () => {
  it.each([
    ["2 when the platform cannot be reached", { networkError: "ECONNREFUSED" }, 2],
    ["2 when the platform keeps answering 503", { status: 503, statusText: "Unavailable" }, 2],
    ["2 when the response is not a translations payload", { body: { nope: true } }, 2],
    ["3 when the key is rejected", { status: 401, statusText: "Unauthorized" }, 3],
    ["3 when access is denied", { status: 403, statusText: "Forbidden" }, 3],
  ])("exits %s", async (_label, translations, code) => {
    http = stubFetch({ ...BASE, [PATHS.translations]: translations });

    expect(await run(createPullCommand(), [])).toBe(code);
  });

  it("exits 4 when no .comvirc.json exists", async () => {
    await fs.rm(join(root, ".comvirc.json"));
    http = stubFetch({});

    expect(await run(createPullCommand(), [])).toBe(4);
  });

  it("matches --locale to the project's spelling of a locale", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.translations]: {
        body: { locales: ["en", "pt-BR"], namespaces: { common: { "pt-BR": { hi: "Oi" } } } },
      },
    });

    expect(await run(createPullCommand(), ["--locale", "pt_br"])).toBe(0);
    expect(JSON.parse(await fs.readFile(join(root, "locales", "pt-BR.json"), "utf-8"))).toEqual({
      hi: "Oi",
    });
  });
});

describe("push", () => {
  beforeEach(async () => {
    await write("locales/en.json", { greeting: "Hello" });
  });

  it("exits 0 on success", async () => {
    http = stubFetch({ ...BASE, [PATHS.commit]: COMMIT_OK });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(0);
  });

  it("exits 1 when --force-mode abort meets a conflict", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
    });

    expect(await run(createPushCommand(), ["--force-mode", "abort"])).toBe(1);
  });

  it("exits 1 when the platform refuses the commit for a conflict", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.translations]: TRANSLATIONS_OK,
      [PATHS.commit]: {
        body: {
          success: false,
          stats: COMMIT_OK.body.stats,
          errors: [
            {
              key: "greeting",
              namespace: "common",
              message: "Conflict: local value differs from server value",
            },
          ],
        },
      },
    });

    expect(await run(createPushCommand(), ["--force-mode", "abort"])).toBe(1);
  });

  it("exits 4 when the platform refuses the commit for invalid input", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.commit]: {
        body: {
          success: false,
          stats: COMMIT_OK.body.stats,
          errors: [{ key: "greeting", namespace: "common", message: "exceeds character limit" }],
        },
      },
    });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(4);
  });

  it("exits 4 when --force-mode ask has no terminal to ask on", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.translations]: {
        body: { locales: ["en"], namespaces: { common: { en: { greeting: "Hola" } } } },
      },
    });
    const isTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      expect(await run(createPushCommand(), ["--force-mode", "ask"])).toBe(4);
    } finally {
      if (isTTY) Object.defineProperty(process.stdin, "isTTY", isTTY);
      else delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
  });

  it.each([
    ["2 when the commit cannot reach the platform", { networkError: "ECONNRESET" }, 2],
    ["2 when the commit gets a 500", { status: 500, statusText: "Internal Server Error" }, 2],
    ["3 when the commit is forbidden", { status: 403, statusText: "Forbidden" }, 3],
  ])("exits %s", async (_label, commit, code) => {
    http = stubFetch({ ...BASE, [PATHS.commit]: commit });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(code);
  });

  it("retries a commit the platform rolled back with 409 TRANSACTION_CONFLICT", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.commit]: [
        {
          status: 409,
          statusText: "Conflict",
          body: { code: "TRANSACTION_CONFLICT", message: "rolled back, safe to retry" },
        },
        COMMIT_OK,
      ],
    });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(0);
    expect(http.paths().filter((path) => path === PATHS.commit)).toHaveLength(2);
  });

  describe("local locales the project does not have", () => {
    beforeEach(async () => {
      await write("locales/fr.json", { greeting: "Bonjour" });
    });

    it("exit 4 before anything is written, naming them", async () => {
      http = stubFetch({ ...BASE });

      expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(4);
      expect(output.stderr).toContain("fr");
      expect(output.stderr).toContain("--skip-unknown-locales");
      expect(http.paths()).not.toContain(PATHS.commit);
    });

    it("are left out with --skip-unknown-locales, with a warning", async () => {
      http = stubFetch({ ...BASE, [PATHS.commit]: COMMIT_OK });

      expect(
        await run(createPushCommand(), ["--force-mode", "override", "--skip-unknown-locales"]),
      ).toBe(0);
      expect(http.jsonBodyFor(PATHS.commit).namespaces).toEqual({
        common: { en: { greeting: "Hello" } },
      });
      expect(output.stderr).toContain("fr");
    });
  });

  it("sends a local locale under the project's spelling", async () => {
    await write("locales/pt_br.json", { greeting: "Olá" });
    http = stubFetch({ ...BASE, [PATHS.commit]: COMMIT_OK });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(0);
    const body = http.jsonBodyFor(PATHS.commit) as { namespaces: { common: object } };
    expect(body.namespaces.common).toHaveProperty("pt-BR");
  });

  it("selects a local file by --locale in any spelling of its locale", async () => {
    await write("locales/pt-BR.json", { greeting: "Olá" });
    http = stubFetch({ ...BASE, [PATHS.commit]: COMMIT_OK });

    expect(await run(createPushCommand(), ["--force-mode", "override", "--locale", "pt_br"])).toBe(
      0,
    );
    const body = http.jsonBodyFor(PATHS.commit) as { namespaces: { common: object } };
    expect(Object.keys(body.namespaces.common)).toEqual(["pt-BR"]);
  });

  it("exits 4 when two files spell the same locale", async () => {
    await write("locales/pt_BR.json", { greeting: "Olá" });
    await write("locales/pt-BR.json", { greeting: "Oi" });
    http = stubFetch({ ...BASE });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(4);
    expect(output.stderr).toContain("pt-BR");
  });

  it("checks nothing when the platform has no locales endpoint, and still pushes", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.projectLocales]: {
        status: 404,
        statusText: "Not Found",
        body: { code: "NOT_FOUND", message: "Route GET:/v1/project/locales not found" },
      },
      [PATHS.commit]: COMMIT_OK,
    });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(0);
  });

  it("exits 4 when there is nothing to push, unless --allow-empty", async () => {
    await fs.rm(join(root, "locales"), { recursive: true });
    http = stubFetch({ ...BASE });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(4);
    expect(output.stderr).toContain("--allow-empty");
  });

  it("exits 4 when --skip-unknown-locales leaves nothing to push", async () => {
    await fs.rm(join(root, "locales", "en.json"));
    await write("locales/fr.json", { greeting: "Bonjour" });
    http = stubFetch({ ...BASE });

    expect(
      await run(createPushCommand(), ["--force-mode", "override", "--skip-unknown-locales"]),
    ).toBe(4);
    expect(http.paths()).not.toContain(PATHS.commit);
  });

  it("exits 4 when the files hold no translation values", async () => {
    await write("locales/en.json", {});
    http = stubFetch({ ...BASE });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(4);
    expect(http.paths()).not.toContain(PATHS.commit);
  });

  it("exits 2 when the commit's stats are not numbers", async () => {
    http = stubFetch({ ...BASE, [PATHS.commit]: { body: { success: true, stats: {} } } });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(2);
  });

  it("exits 3 when the locales lookup says the project is gone", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.projectLocales]: {
        status: 404,
        statusText: "Not Found",
        body: { code: "PROJECT_NOT_FOUND", message: "Project not found" },
      },
    });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(3);
  });

  it("does not retry a 409 that is not a rolled-back transaction", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.commit]: { status: 409, statusText: "Conflict", body: { code: "CONFLICT" } },
    });

    await run(createPushCommand(), ["--force-mode", "override"]);
    expect(http.paths().filter((path) => path === PATHS.commit)).toHaveLength(1);
  });

  it("exits 2 after a second rolled-back 409, having sent the commit twice", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.commit]: {
        status: 409,
        statusText: "Conflict",
        body: { code: "TRANSACTION_CONFLICT" },
      },
    });

    expect(await run(createPushCommand(), ["--force-mode", "override"])).toBe(2);
    expect(http.paths().filter((path) => path === PATHS.commit)).toHaveLength(2);
  });

  it("exits 0 with --allow-empty when there is nothing to push", async () => {
    await fs.rm(join(root, "locales"), { recursive: true });
    http = stubFetch({ ...BASE });

    expect(await run(createPushCommand(), ["--force-mode", "override", "--allow-empty"])).toBe(0);
  });
});

describe("typegen", () => {
  const SCHEMA_OK: Routes = { ...BASE, [PATHS.schema]: { body: { keys: {} } } };

  it.each([
    ["generate", []],
    ["--check", ["--check"]],
  ])("%s exits 2 when the platform cannot be reached", async (_label, args) => {
    http = stubFetch({ ...BASE, [PATHS.schema]: { networkError: "ENOTFOUND" } });

    expect(await run(createTypegenCommand(), args)).toBe(2);
  });

  it.each([
    ["generate", []],
    ["--check", ["--check"]],
  ])("%s exits 3 when the key is rejected", async (_label, args) => {
    http = stubFetch({ ...BASE, [PATHS.schema]: { status: 401, statusText: "Unauthorized" } });

    expect(await run(createTypegenCommand(), args)).toBe(3);
  });

  it("--check exits 1 when the file is outdated", async () => {
    http = stubFetch(SCHEMA_OK);

    expect(await run(createTypegenCommand(), ["--check"])).toBe(1);
  });

  it("generate exits 4 for a schema the emitter refuses", async () => {
    http = stubFetch({
      ...BASE,
      [PATHS.schema]: {
        body: { keys: { "common:a": { params: [{ name: "n", type: "date" }] } } },
      },
    });

    expect(await run(createTypegenCommand(), [])).toBe(4);
  });

  it("generate exits 2 when the schema is not a schema", async () => {
    http = stubFetch({ ...BASE, [PATHS.schema]: { body: "<html>maintenance</html>" } });

    expect(await run(createTypegenCommand(), [])).toBe(2);
  });
});

describe("init", () => {
  it("exits 4 when .comvirc.json already exists", async () => {
    http = stubFetch({});

    expect(await run(createInitCommand(), [])).toBe(4);
  });
});
