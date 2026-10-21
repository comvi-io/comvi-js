import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createPullCommand } from "../src/commands/pull";
import {
  assertNoUnexpectedRequests,
  captureConsole,
  ExitSignal,
  makeTempDir,
  removeTempDirs,
  stubFetch,
  stubProcessExit,
  type ConsoleCapture,
  type ProcessExitCapture,
} from "./helpers";

let root: string;
let localesDir: string;
let output: ConsoleCapture;
let exits: ProcessExitCapture;

beforeEach(async () => {
  vi.stubEnv("COMVI_API_KEY", "");
  vi.stubEnv("COMVI_API_BASE_URL", "");
  exits = stubProcessExit();
  output = captureConsole();
  root = await fs.realpath(await makeTempDir("comvi-pull-diff"));
  localesDir = join(root, "locales");
  vi.spyOn(process, "cwd").mockReturnValue(root);
  await fs.writeFile(
    join(root, ".comvirc.json"),
    JSON.stringify({
      apiKey: "k",
      apiBaseUrl: "https://api.test.com",
      translationsPath: localesDir,
    }),
  );
  stubFetch({
    "/v1/project": { body: { id: 1 } },
    "/v1/projects/1/namespaces": { body: [{ namespace: "common", isDefault: true }] },
    "/v1/translations": {
      body: {
        locales: ["en", "de"],
        namespaces: {
          common: {
            en: { greeting: "Hello", "nav.home": "Home", added: "New" },
            de: { greeting: "Hallo" },
          },
        },
      },
    },
  });
});

afterEach(async () => {
  await removeTempDirs();
  assertNoUnexpectedRequests();
});

async function pull(args: string[]): Promise<number> {
  try {
    await createPullCommand().parseAsync(args, { from: "user" });
  } catch (error) {
    if (!(error instanceof ExitSignal)) throw error;
  }
  return exits.codes[0];
}

async function writeLocal(file: string, content: object): Promise<void> {
  await fs.mkdir(localesDir, { recursive: true });
  await fs.writeFile(join(localesDir, file), JSON.stringify(content));
}

describe("pull --dry-run", () => {
  it("shows per file which keys it would add, change and remove", async () => {
    await writeLocal("en.json", { greeting: "Hi", "nav.home": "Home", "local.only": "Unpushed" });

    expect(await pull(["--dry-run"])).toBe(0);

    expect(output.log).toContain(`  ${join(localesDir, "en.json")} (+1 ~1 −1)`);
    expect(output.log).toContain("    − local.only");
    expect(output.log).toContain(`  ${join(localesDir, "de.json")} (new, 1 key)`);
  });

  it("calls a file that would not change unchanged", async () => {
    await writeLocal("de.json", { greeting: "Hallo" });

    expect(await pull(["--dry-run"])).toBe(0);

    expect(output.log).toContain(`  ${join(localesDir, "de.json")} (unchanged)`);
  });

  it("says when nested keys would be written flat", async () => {
    await writeLocal("en.json", { greeting: "Hello", nav: { home: "Home" }, added: "New" });

    expect(await pull(["--dry-run"])).toBe(0);

    expect(output.log).toContain(`  ${join(localesDir, "en.json")} (nested keys written flat)`);
  });

  it("does not fail on a local file it cannot parse", async () => {
    await fs.mkdir(localesDir, { recursive: true });
    await fs.writeFile(join(localesDir, "en.json"), "{ not json");

    expect(await pull(["--dry-run"])).toBe(0);

    expect(output.log).toContain(`  ${join(localesDir, "en.json")} (replaces an unreadable file)`);
  });

  it("names at most ten removed keys per file", async () => {
    const local = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`gone${i}`, "x"]));
    await writeLocal("de.json", { greeting: "Hallo", ...local });

    expect(await pull(["--dry-run"])).toBe(0);

    expect(output.log).toContain("    − gone9");
    expect(output.log).not.toContain("    − gone10");
    expect(output.log).toContain("    … and 2 more");
  });
});

describe("pull", () => {
  it("warns before replacing keys that exist only locally, then writes", async () => {
    await writeLocal("en.json", { greeting: "Hello", "local.only": "Unpushed", "also.local": "x" });

    expect(await pull([])).toBe(0);

    expect(output.stderr).toContain(
      "⚠  Pull removes 2 local keys the platform does not have: " +
        `${join(localesDir, "en.json")}: local.only, also.local`,
    );
    expect(output.stderr).toContain("comvi push");
    expect(JSON.parse(await fs.readFile(join(localesDir, "en.json"), "utf-8"))).toEqual({
      greeting: "Hello",
      "nav.home": "Home",
      added: "New",
    });
  });

  it("does not warn when no local key is lost, nested or not", async () => {
    await writeLocal("en.json", { greeting: "Old", nav: { home: "Home" } });

    expect(await pull([])).toBe(0);

    expect(output.stderr).not.toContain("Pull removes");
  });
});
