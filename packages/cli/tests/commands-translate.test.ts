import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createTranslateCommand } from "../src/commands/translate";
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
  type RouteResponse,
  type Routes,
} from "./helpers";

/**
 * Faults in the write phase: `afterWrites` makes the merge writer throw
 * `error` right after it wrote that many files; `failWrite` fails the atomic
 * write of that file name.
 */
const mergeFault = vi.hoisted(() => ({
  error: undefined as Error | undefined,
  afterWrites: 1,
  writes: 0,
  failWrite: undefined as string | undefined,
}));

vi.mock("../src/utils/atomicWrite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/atomicWrite")>();
  return {
    ...actual,
    atomicWriteFile: (...args: Parameters<typeof actual.atomicWriteFile>) =>
      mergeFault.failWrite && args[0].endsWith(mergeFault.failWrite)
        ? Promise.reject(new Error("EACCES: permission denied"))
        : actual.atomicWriteFile(...args),
  };
});

vi.mock("../src/core/MissingMerge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/MissingMerge")>();
  return {
    ...actual,
    mergeMissing: (...[options, report]: Parameters<typeof actual.mergeMissing>) =>
      actual.mergeMissing(
        {
          ...options,
          onFileWritten(file) {
            options.onFileWritten?.(file);
            if (mergeFault.error && ++mergeFault.writes === mergeFault.afterWrites) {
              throw mergeFault.error;
            }
          },
        },
        report,
      ),
  };
});

/**
 * `comvi translate` runs for real against a temp directory: ConfigLoader,
 * ApiClient, push and the merge writer all execute; only `fetch` is stubbed,
 * with the shapes of the platform contract fixture. Timers are fake, so the
 * polling waits cost nothing and the request budget is counted on the fake
 * clock, never on the wall clock.
 */

const contract = JSON.parse(
  readFileSync(join(__dirname, "fixtures/translate/contract.json"), "utf-8"),
) as { fill: Record<string, RouteResponse>; status: Record<string, RouteResponse> };

const API_BASE_URL = "https://api.test.com";
const PATHS = {
  project: "/v1/project",
  namespaces: "/v1/projects/123/namespaces",
  locales: "/v1/project/locales",
  translations: "/v1/translations",
  commit: "/v1/projects/123/import/commit",
  fill: "/v1/projects/123/mt/fill",
  status: (jobId: string) => `/v1/projects/123/keys/batch/mt/${jobId}/status`,
} as const;

const DE_JOB = "fill-123-de-1";
const UK_JOB = "auto-mt-123-uk-1";

const COMMIT_OK: RouteResponse = {
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

const NO_WORK = contract.fill.nothingToDo;

function fillResponse(
  jobs: Array<{ jobId: string; targetLocaleCode: string; keyCount?: number; owned?: boolean }>,
  extra: Record<string, unknown> = {},
): RouteResponse {
  return {
    status: 202,
    body: {
      jobs: jobs.map((job) => ({ keyCount: 1, owned: true, ...job })),
      pairs: { toTranslate: jobs.length, alreadyInFlight: 0, alreadyTranslated: 3, noSource: 0 },
      skippedLocales: [],
      estimate: { credits: 2, approximate: false },
      credits: { exhausted: false },
      ...extra,
    },
  };
}

function completed(
  jobId: string,
  result: Record<string, unknown> = { processed: 1, failed: 0, errors: [] },
): RouteResponse {
  return { body: { jobId, status: "completed", progress: 100, result } };
}

const waiting = (jobId: string): RouteResponse => ({ body: { jobId, status: "waiting" } });

function translationsBody(byLocale: Record<string, Record<string, string>>): RouteResponse {
  const common: Record<string, Record<string, string>> = {};
  for (const [locale, values] of Object.entries(byLocale)) common[locale] = values;
  return { body: { locales: ["en", "de", "uk"], namespaces: { common } } };
}

/** The platform with de's farewell still empty while its source is there. */
const DE_FAREWELL_EMPTY = (): RouteResponse =>
  translationsBody({
    en: { greeting: "Hello", farewell: "Bye" },
    de: { greeting: "Hallo (platform)" },
    uk: { greeting: "Привіт", farewell: "Бувай" },
  });

/** The platform after the job ran: de and uk carry every key. */
const TRANSLATED = translationsBody({
  en: { greeting: "Hello", farewell: "Bye" },
  de: { greeting: "Hallo (platform)", farewell: "Tschüss" },
  uk: { greeting: "Привіт", farewell: "Бувай" },
});

describe("comvi translate", () => {
  let root: string;
  let localesDir: string;
  let configPath: string;
  let exits: ProcessExitCapture;
  let output: ConsoleCapture;
  let http: FetchCapture;

  async function writeLocale(locale: string, values: Record<string, unknown>): Promise<void> {
    const filePath = join(localesDir, `${locale}.json`);
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(values), "utf-8");
  }

  async function readLocale(locale: string): Promise<unknown> {
    return JSON.parse(await fs.readFile(join(localesDir, `${locale}.json`), "utf-8"));
  }

  async function exists(locale: string): Promise<boolean> {
    return fs.access(join(localesDir, `${locale}.json`)).then(
      () => true,
      () => false,
    );
  }

  /** Base routes; `extra` replaces or adds entries. */
  function serve(extra: Routes): FetchCapture {
    http = stubFetch({
      [PATHS.project]: { body: { id: 123, sourceLocale: "en" } },
      [PATHS.namespaces]: { body: [{ namespace: "common", isDefault: true }] },
      [PATHS.locales]: { body: { locales: [{ code: "en" }, { code: "de" }, { code: "uk" }] } },
      [PATHS.commit]: COMMIT_OK,
      [PATHS.translations]: TRANSLATED,
      ...extra,
    });
    return http;
  }

  /** Runs the command to its exit, advancing the fake clock while it waits. */
  async function translate(args: string[]): Promise<number> {
    let settled = false;
    const run = createTranslateCommand()
      .parseAsync(["-c", configPath, ...args], { from: "user" })
      .catch((error: unknown) => {
        if (!(error instanceof ExitSignal)) throw error;
      })
      .finally(() => {
        settled = true;
      });
    for (let i = 0; !settled && i < 20_000; i++) {
      await vi.advanceTimersByTimeAsync(250);
      await new Promise((resolve) => setImmediate(resolve));
    }
    await run;
    if (exits.codes.length === 0) throw new Error("translate returned without process.exit");
    return exits.codes[0];
  }

  function fillBodies(): Array<Record<string, unknown>> {
    return http.requests
      .filter((request) => new URL(request.url).pathname === PATHS.fill)
      .map((request) => JSON.parse(String(request.init.body)));
  }

  function statusRequests(jobId: string): number {
    return http.paths().filter((path) => path === PATHS.status(jobId)).length;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubEnv("COMVI_API_KEY", "");
    vi.stubEnv("COMVI_API_BASE_URL", "");
    exits = stubProcessExit();
    output = captureConsole();
    root = await makeTempDir("comvi-translate");
    localesDir = join(root, "locales");
    configPath = join(root, ".comvirc.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({ apiKey: "k", apiBaseUrl: API_BASE_URL, translationsPath: localesDir }),
    );
    await writeLocale("en", { greeting: "Hello", farewell: "Bye" });
    await writeLocale("de", { greeting: "Hallo" });
  });

  afterEach(async () => {
    mergeFault.error = undefined;
    mergeFault.afterWrites = 1;
    mergeFault.writes = 0;
    mergeFault.failWrite = undefined;
    vi.useRealTimers();
    await removeTempDirs();
    assertNoUnexpectedRequests();
  });

  describe("exit 0", () => {
    it("pushes without auto-MT, fills, waits and writes only the missing values", async () => {
      serve({
        [PATHS.fill]: [
          contract.fill.dryRun,
          fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        ],
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
      });

      expect(await translate(["--force-mode", "override"])).toBe(0);

      // Preflight before the push, the real fill after it.
      const order = http.paths().filter((p) => p === PATHS.fill || p === PATHS.commit);
      expect(order).toEqual([PATHS.fill, PATHS.commit, PATHS.fill]);
      expect(fillBodies()).toEqual([{ dryRun: true }, { maxPairs: 1000 }]);
      expect(http.jsonBodyFor(PATHS.commit).options).toMatchObject({ scheduleAutoMt: false });

      // The local "Hallo" is kept; the platform's farewell fills the gap; uk is new.
      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
      expect(await readLocale("uk")).toEqual({ greeting: "Привіт", farewell: "Бувай" });
      expect(await readLocale("en")).toEqual({ greeting: "Hello", farewell: "Bye" });
      expect(output.stdout).toContain("1 differs from the platform; `comvi pull` will update it");
      expect(output.stdout).toContain("Files changed: 2");
      expect(output.log).toContain("⏳ Waiting for 1 job...");
      expect(output.stdout).not.toContain("Jobs keep running");
    });

    it("still writes the platform's values when there is nothing to translate", async () => {
      serve({ [PATHS.fill]: [contract.fill.dryRun, NO_WORK] });

      expect(await translate(["--force-mode", "override"])).toBe(0);

      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
      expect(http.paths().some((p) => p.includes("/keys/batch/mt/"))).toBe(false);
    });

    it("--no-push sends no commit and no preflight", async () => {
      serve({ [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push"])).toBe(0);

      expect(http.paths()).not.toContain(PATHS.commit);
      expect(fillBodies()).toEqual([{ maxPairs: 1000 }]);
    });

    it("warns about locales skipped by default and about keys without a source", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }], {
          skippedLocales: [{ code: "ja", reason: "forbidden" }],
        }),
        [PATHS.status(DE_JOB)]: completed(DE_JOB, {
          processed: 1,
          failed: 1,
          errors: [{ keyId: 9, key: "empty", message: "No source", type: "no_source" }],
        }),
      });

      expect(await translate(["--no-push"])).toBe(0);

      expect(output.stderr).toContain("Skipped locales: ja (forbidden)");
      expect(output.stdout).toContain("1 no source");
    });

    it("sends --max-keys as maxPairs, and none at all for 0", async () => {
      serve({ [PATHS.fill]: NO_WORK });
      expect(await translate(["--no-push", "--max-keys", "5"])).toBe(0);
      expect(fillBodies()).toEqual([{ maxPairs: 5 }]);

      exits.codes.length = 0;
      serve({ [PATHS.fill]: NO_WORK });
      expect(await translate(["--no-push", "--max-keys", "0"])).toBe(0);
      expect(fillBodies()).toEqual([{}]);
    });

    it("matches -l to the project's spelling and pushes the source locale with it", async () => {
      serve({ [PATHS.fill]: [contract.fill.dryRun, NO_WORK] });

      expect(await translate(["--force-mode", "override", "-l", "DE", "--ns", "common"])).toBe(0);

      expect(fillBodies()).toEqual([
        { dryRun: true, targetLocaleCodes: ["de"] },
        { targetLocaleCodes: ["de"], namespaces: ["common"], maxPairs: 1000 },
      ]);
      const pushed = http.jsonBodyFor(PATHS.commit).namespaces as Record<string, object>;
      expect(Object.keys(pushed.common).sort()).toEqual(["de", "en"]);
      expect(await exists("uk")).toBe(false);
    });
  });

  describe("exit 1", () => {
    it.each(["provider_error", "no_translation", "unknown"])(
      "%s in a job: exit 1, the successes are written",
      async (type) => {
        serve({
          [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
          [PATHS.status(DE_JOB)]: completed(DE_JOB, {
            processed: 1,
            failed: 1,
            errors: [{ keyId: 3, key: "other", message: "Provider said no", type }],
          }),
        });

        expect(await translate(["--no-push"])).toBe(1);

        expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
        expect(output.stderr).toContain("other");
      },
    );

    it("a failed job of this run: exit 1", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: {
          body: { jobId: DE_JOB, status: "failed", error: "Worker crashed" },
        },
      });

      expect(await translate(["--no-push"])).toBe(1);
      expect(output.stderr).toContain("Worker crashed");
    });

    it("a failed job started elsewhere: exit 1, and the output says it is not ours", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: UK_JOB, targetLocaleCode: "uk", owned: false }]),
        [PATHS.status(UK_JOB)]: { body: { jobId: UK_JOB, status: "failed", error: "Boom" } },
      });

      expect(await translate(["--no-push"])).toBe(1);
      expect(output.stderr).toContain(`job ${UK_JOB}, not started by this run`);
    });

    it("an evicted job whose target is still empty: exit 1, run again", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "-l", "de"])).toBe(1);

      expect(statusRequests(DE_JOB)).toBe(1);
      expect(output.error).toContain("✗ de: 1 value is still empty after its jobs ended");
      expect(output.stdout).toContain("Some values are still empty; run `comvi translate` again.");
      expect(output.stdout).not.toContain("Jobs keep running");
    });

    it("an evicted job whose target has no source on the platform: exit 0, push first", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        // farewell exists only locally: this run did not push it.
        [PATHS.translations]: translationsBody({
          en: { greeting: "Hello" },
          de: { greeting: "Hallo" },
        }),
      });

      expect(await translate(["--no-push", "-l", "de"])).toBe(0);

      expect(output.error).toEqual([
        "⚠  1 empty value has no source on the platform; push first: de: farewell",
      ]);
      expect(output.stdout).not.toContain("run `comvi translate` again");
    });

    it("an evicted job whose pairs were written: exit 0", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
      });

      expect(await translate(["--no-push", "-l", "de"])).toBe(0);
      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
    });

    it("a structural collision: exit 1, the key is reported and the rest is written", async () => {
      await writeLocale("en", { greeting: "Hello", farewell: "Bye", "nav.home": "Home" });
      // A nested file: `nav.home` would nest under the leaf `nav`.
      await writeLocale("uk", { nav: "Навігація", footer: { text: "Футер" } });
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: translationsBody({
          de: { greeting: "Hallo", farewell: "Tschüss", "nav.home": "Start" },
          uk: { greeting: "Привіт", farewell: "Бувай", "nav.home": "Головна" },
        }),
      });

      expect(await translate(["--no-push"])).toBe(1);

      expect(await readLocale("uk")).toEqual({
        nav: "Навігація",
        footer: { text: "Футер" },
        greeting: "Привіт",
        farewell: "Бувай",
      });
      expect(output.stderr).toContain("nav.home");
    });
  });

  describe("exit 2", () => {
    it("a timeout: exit 2, ready values are written and the work is unfinished", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: waiting(DE_JOB),
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "--timeout", "30s"])).toBe(2);

      expect(await readLocale("uk")).toEqual({ greeting: "Привіт", farewell: "Бувай" });
      expect(output.error).toContain("✗ de: 1 value is still empty; its jobs are still running");
      expect(output.stdout).toContain(
        "Jobs keep running; run `comvi translate` again or `comvi pull`",
      );
    });

    it("the platform is unavailable before the push: exit 2 and no push", async () => {
      serve({ [PATHS.fill]: { status: 503, body: {} } });

      expect(await translate(["--force-mode", "override"])).toBe(2);
      expect(http.paths()).not.toContain(PATHS.commit);
    });

    it("the fetch of the results fails: exit 2 and nothing is claimed written", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
        [PATHS.translations]: { status: 503, body: {} },
      });

      expect(await translate(["--no-push"])).toBe(2);

      expect(await readLocale("de")).toEqual({ greeting: "Hallo" });
      expect(output.stdout).not.toContain("Files changed");
      expect(output.stderr).toContain("Nothing was written");
    });
  });

  describe("exit 3", () => {
    it("insufficient credits in a job: exit 3, the successes are written", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB, {
          processed: 1,
          failed: 1,
          errors: [{ keyId: 7, key: "later", message: "Out", type: "insufficient_credits" }],
        }),
      });

      expect(await translate(["--no-push"])).toBe(3);

      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
      expect(output.stderr).toContain("Top up");
    });

    it("403 LIMIT_EXCEEDED on the fill: the jobs in flight are still collected, exit 3", async () => {
      serve({
        [PATHS.fill]: contract.fill.creditsExhausted,
        [PATHS.status("auto-mt-123-uk-77")]: completed("auto-mt-123-uk-77"),
      });

      expect(await translate(["--no-push"])).toBe(3);

      expect(statusRequests("auto-mt-123-uk-77")).toBe(1);
      expect(await readLocale("uk")).toEqual({ greeting: "Привіт", farewell: "Бувай" });
    });

    it("no mt:use scope: exit 3 in the preflight with a hint, and no push", async () => {
      serve({ [PATHS.fill]: contract.fill.missingScope });

      expect(await translate(["--force-mode", "override"])).toBe(3);

      expect(output.stderr).toContain("mt:use");
      expect(http.paths()).not.toContain(PATHS.commit);
    });

    it("a forbidden locale asked for: exit 3 and no push", async () => {
      serve({ [PATHS.fill]: contract.fill.forbiddenLocale });

      expect(await translate(["--force-mode", "override", "-l", "uk"])).toBe(3);
      expect(http.paths()).not.toContain(PATHS.commit);
    });

    it("a project that is gone: exit 3", async () => {
      serve({ [PATHS.fill]: contract.fill.projectNotFound });

      expect(await translate(["--force-mode", "override"])).toBe(3);
      expect(http.paths()).not.toContain(PATHS.commit);
    });
  });

  describe("exit 4", () => {
    it("a platform without mt/fill: exit 4 in the preflight, and no push", async () => {
      serve({ [PATHS.fill]: contract.fill.routeNotFound });

      expect(await translate(["--force-mode", "override"])).toBe(4);

      expect(output.stderr).toContain("does not support comvi translate");
      expect(http.paths()).not.toContain(PATHS.commit);
    });

    it("over --max-keys: exit 4 with the count and the estimate, no MT, nothing written", async () => {
      serve({ [PATHS.fill]: contract.fill.overLimit });

      expect(await translate(["--no-push"])).toBe(4);

      expect(output.stderr).toContain("2400");
      expect(output.stderr).toContain("3100");
      expect(http.paths()).not.toContain(PATHS.translations);
      expect(await exists("uk")).toBe(false);
    });

    it("an unknown namespace: exit 4", async () => {
      serve({ [PATHS.fill]: contract.fill.unknownNamespace });

      expect(await translate(["--no-push", "--ns", "nope"])).toBe(4);
    });

    it.each([
      [["--max-keys", "-1"]],
      [["--max-keys", "1.5"]],
      [["--max-keys", "many"]],
      [["--timeout", "soon"]],
      [["--timeout", "0"]],
      [["--format", "xml"]],
      [["--force-mode", "merge"]],
    ])("refuses %j before any request", async (flags) => {
      serve({});

      expect(await translate(flags)).toBe(4);
      expect(http.requests).toEqual([]);
    });
  });

  describe("combinations", () => {
    it("credits run out and another job times out: exit 3, and the work is unfinished", async () => {
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: UK_JOB, targetLocaleCode: "uk" },
        ]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB, {
          processed: 0,
          failed: 1,
          errors: [{ keyId: 1, key: "farewell", message: "Out", type: "insufficient_credits" }],
        }),
        [PATHS.status(UK_JOB)]: waiting(UK_JOB),
        [PATHS.translations]: translationsBody({
          en: { greeting: "Hello", farewell: "Bye" },
          de: { greeting: "Hallo" },
          uk: { greeting: "Привіт" },
        }),
      });

      expect(await translate(["--no-push", "--timeout", "1m"])).toBe(3);
      expect(output.stdout).toContain("Jobs keep running");
    });

    it("a provider error and then an API outage: exit 1, nothing claimed written", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB, {
          processed: 0,
          failed: 1,
          errors: [{ keyId: 1, key: "farewell", message: "Down", type: "provider_error" }],
        }),
        [PATHS.translations]: { networkError: "ECONNRESET" },
      });

      expect(await translate(["--no-push"])).toBe(1);
      expect(output.stdout).not.toContain("Files changed");
    });
  });

  describe("polling", () => {
    it("stops polling a job whose status is 404, while it keeps polling the rest", async () => {
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: UK_JOB, targetLocaleCode: "uk", owned: false },
        ]),
        [PATHS.status(DE_JOB)]: [waiting(DE_JOB), waiting(DE_JOB), completed(DE_JOB)],
        [PATHS.status(UK_JOB)]: contract.status.gone,
      });

      expect(await translate(["--no-push"])).toBe(0);

      expect(statusRequests(UK_JOB)).toBe(1);
      expect(statusRequests(DE_JOB)).toBe(3);
    });

    it("a 403 on a job's status: exit 3", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: UK_JOB, targetLocaleCode: "uk", owned: false }]),
        [PATHS.status(UK_JOB)]: { status: 403, body: { code: "FORBIDDEN", message: "No" } },
      });

      expect(await translate(["--no-push"])).toBe(3);
    });

    it("shares one budget across jobs: at least 2 s between requests, backing off to 10 s", async () => {
      const at: number[] = [];
      const stamp = (jobId: string): RouteResponse => ({
        ...waiting(jobId),
        onRequest: () => void at.push(Date.now()),
      });
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: UK_JOB, targetLocaleCode: "uk" },
        ]),
        [PATHS.status(DE_JOB)]: stamp(DE_JOB),
        [PATHS.status(UK_JOB)]: stamp(UK_JOB),
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "--timeout", "2m"])).toBe(2);

      const gaps = at.slice(1).map((time, i) => time - at[i]);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2_000);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(10_000);
      expect(gaps[gaps.length - 1]).toBe(10_000);
      // Both jobs were asked about, in turns.
      expect(statusRequests(DE_JOB)).toBeGreaterThan(1);
      expect(statusRequests(UK_JOB)).toBeGreaterThan(1);
      expect(at.length).toBeLessThanOrEqual(120 / 2);
    });

    it("an edit made to a local file during polling survives", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: {
          ...completed(DE_JOB),
          onRequest: () => writeLocale("de", { greeting: "Hallo", farewell: "Von Hand" }),
        },
      });

      expect(await translate(["--no-push"])).toBe(0);

      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Von Hand" });
    });
  });

  describe("--dry-run", () => {
    beforeEach(async () => {
      // The platform has only `greeting`; push would add `farewell`.
      await writeLocale("en", { greeting: "Hello", farewell: "Bye" });
      await writeLocale("de", {});
    });

    const REMOTE = translationsBody({ en: { greeting: "Hello" }, de: {}, uk: {} });

    it("prints both lines, sends one dry-run fill, and writes and pushes nothing", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun, [PATHS.translations]: REMOTE });

      expect(await translate(["--dry-run", "--force-mode", "override"])).toBe(0);

      expect(output.stdout).toContain("On the platform: 2 pairs, ≈3 credits");
      // farewell × (de, uk): its source arrives with the push.
      expect(output.stdout).toContain(
        "Not yet on the platform (would be pushed): ~2 pairs (preview)",
      );
      expect(fillBodies()).toEqual([{ dryRun: true }]);
      expect(http.paths()).not.toContain(PATHS.commit);
      expect(await readLocale("de")).toEqual({});
      expect(await exists("uk")).toBe(false);
    });

    it("over the limit on the platform alone: exit 4", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun, [PATHS.translations]: REMOTE });

      expect(await translate(["--dry-run", "--force-mode", "override", "--max-keys", "1"])).toBe(4);
      expect(output.stderr).toContain("--max-keys");
    });

    it("over the limit only with the pushed pairs: a warning, exit 0", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun, [PATHS.translations]: REMOTE });

      expect(await translate(["--dry-run", "--force-mode", "override", "--max-keys", "3"])).toBe(0);
      expect(output.error).toEqual([
        "⚠  With the values the push adds, the run may go over --max-keys 3 (2 + ~2). " +
          "The real run checks after the push, before any MT.",
      ]);
    });

    it("--no-push prints only the platform line", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun });

      expect(await translate(["--dry-run", "--no-push"])).toBe(0);

      expect(output.stdout).toContain("On the platform: 2 pairs");
      expect(output.stdout).not.toContain("would be pushed");
    });
  });

  describe("--format json", () => {
    function json(): Record<string, unknown> {
      expect(output.log).toHaveLength(1);
      return JSON.parse(output.log[0]);
    }

    it("prints one JSON document and nothing else on stdout", async () => {
      serve({
        [PATHS.fill]: [
          contract.fill.dryRun,
          fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        ],
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
      });

      expect(await translate(["--force-mode", "override", "--format", "json"])).toBe(0);

      const doc = json();
      expect(Object.keys(doc).sort()).toEqual(
        ["errors", "jobs", "ok", "pairs", "skippedLocales", "version", "written"].sort(),
      );
      expect(doc).toMatchObject({
        version: 1,
        ok: true,
        errors: [],
        skippedLocales: [],
        pairs: { toTranslate: 1, translated: 1, unfinished: 0 },
        jobs: [{ jobId: DE_JOB, targetLocaleCode: "de", owned: true, status: "completed" }],
        written: { files: 2, values: 3, differ: 1 },
      });
    });

    it("says written: false when the fetch failed", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
        [PATHS.translations]: { status: 503, body: {} },
      });

      expect(await translate(["--no-push", "--format", "json"])).toBe(2);
      expect(json()).toMatchObject({ ok: false, written: false });
    });

    it("reports an early failure as JSON too", async () => {
      serve({ [PATHS.fill]: contract.fill.routeNotFound });

      expect(await translate(["--force-mode", "override", "--format", "json"])).toBe(4);

      expect(json()).toEqual({
        version: 1,
        pairs: null,
        jobs: [],
        written: false,
        errors: [
          { type: "fatal", message: expect.stringContaining("does not support comvi translate") },
        ],
        skippedLocales: [],
        ok: false,
      });
    });
  });

  describe("what a run reports", () => {
    /** de: own job with a provider error; uk: a foreign job that failed; fr: nothing to fill. */
    async function serveMixedRun(): Promise<void> {
      await writeLocale("fr", { greeting: "Bonjour", farewell: "Salut" });
      serve({
        [PATHS.locales]: {
          body: { locales: ["en", "de", "uk", "fr"].map((code) => ({ code })) },
        },
        [PATHS.fill]: {
          status: 202,
          body: {
            jobs: [
              { jobId: DE_JOB, targetLocaleCode: "de", keyCount: 2, owned: true },
              { jobId: UK_JOB, targetLocaleCode: "uk", keyCount: 1, owned: false },
            ],
            pairs: { toTranslate: 2, alreadyInFlight: 1, alreadyTranslated: 3, noSource: 1 },
            skippedLocales: [
              { code: "ja", reason: "forbidden" },
              { code: "ko", reason: "forbidden" },
            ],
            estimate: { credits: 2, approximate: false },
            credits: { exhausted: false },
          },
        },
        [PATHS.status(DE_JOB)]: completed(DE_JOB, {
          processed: 1,
          failed: 2,
          alreadyTranslated: 2,
          skippedFilledMeanwhile: 1,
          errors: [
            { keyId: 8, key: "x", message: "No source", type: "no_source" },
            { keyId: 2, key: "farewell", message: "Down", type: "provider_error" },
          ],
        }),
        [PATHS.status(UK_JOB)]: { body: { jobId: UK_JOB, status: "failed", error: "Boom" } },
        [PATHS.translations]: {
          body: {
            locales: ["en", "de", "uk", "fr"],
            namespaces: {
              common: {
                en: { greeting: "Hello", farewell: "Bye" },
                de: { greeting: "Hallo (platform)", farewell: "Tschüss" },
                uk: { greeting: "Привіт" },
                fr: { greeting: "Bonjour", farewell: "Salut" },
              },
            },
          },
        },
      });
    }

    it("prints every count, problem and file line", async () => {
      await serveMixedRun();

      expect(await translate(["--no-push"])).toBe(1);

      expect(output.log).toEqual([
        "🔄 Loading configuration...",
        "🔄 Requesting machine translation...",
        "⏳ Waiting for 2 jobs...",
        "🔄 Fetching translations from TMS...",
        "📝 Writing missing values...",
        "\n⚠  Translate finished with problems",
        "  Pairs: 1 translated, 1 already in flight, 1 filled meanwhile, 2 no source, " +
          "5 already translated, 1 failed",
        "  Files changed: 2 (2 values)",
        "  1 differs from the platform; `comvi pull` will update it.",
        "Some values are still empty; run `comvi translate` again.",
      ]);
      expect(output.error).toEqual([
        "⚠  Skipped locales: ja (forbidden), ko (forbidden)",
        "✗ de: farewell — Down (provider_error)",
        `✗ uk: job ${UK_JOB}, not started by this run failed: Boom`,
        "✗ uk: 1 value is still empty after its jobs ended",
      ]);
    });

    it("prints the same run as one JSON document", async () => {
      await serveMixedRun();

      expect(await translate(["--no-push", "--format", "json"])).toBe(1);

      expect(output.log).toHaveLength(1);
      expect(JSON.parse(output.log[0])).toEqual({
        version: 1,
        pairs: {
          toTranslate: 2,
          alreadyInFlight: 1,
          alreadyTranslated: 5,
          noSource: 2,
          translated: 1,
          filledMeanwhile: 1,
          failed: 1,
          unfinished: 1,
          unverifiable: 0,
          notOnPlatform: 0,
        },
        jobs: [
          {
            jobId: DE_JOB,
            targetLocaleCode: "de",
            keyCount: 2,
            owned: true,
            status: "completed",
            processed: 1,
            failed: 2,
          },
          { jobId: UK_JOB, targetLocaleCode: "uk", keyCount: 1, owned: false, status: "failed" },
        ],
        written: { files: 2, values: 2, differ: 1 },
        errors: [
          {
            type: "provider_error",
            message: "de: farewell — Down (provider_error)",
            jobId: DE_JOB,
            locale: "de",
            key: "farewell",
          },
          {
            type: "job_failed",
            message: `uk: job ${UK_JOB}, not started by this run failed: Boom`,
            jobId: UK_JOB,
            locale: "uk",
          },
          {
            type: "unfinished",
            message: "uk: 1 value is still empty after its jobs ended",
            locale: "uk",
          },
        ],
        skippedLocales: [
          { code: "ja", reason: "forbidden" },
          { code: "ko", reason: "forbidden" },
        ],
        ok: false,
      });
      // The human lines go to stderr, so stdout stays one document.
      expect(output.stderr).toContain("Translate finished with problems");
    });

    it("prints a clean run without problem lines, in plural", async () => {
      await writeLocale("de", { greeting: "Hallo", farewell: "Lokal" });
      await writeLocale("uk", { farewell: "Бувай" });
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: translationsBody({
          en: { greeting: "Hello", farewell: "Bye" },
          de: { greeting: "Hallo (platform)", farewell: "Tschüss" },
          uk: { greeting: "Привіт", farewell: "Бувай" },
        }),
      });

      expect(await translate(["--no-push"])).toBe(0);

      expect(output.log.slice(-4)).toEqual([
        "\n✓ Translate complete!",
        "  Pairs: 0 translated, 0 already in flight, 0 filled meanwhile, 0 no source, " +
          "6 already translated, 0 failed",
        "  Files changed: 1 (1 value)",
        "  2 differ from the platform; `comvi pull` will update them.",
      ]);
      expect(output.stdout).not.toContain("Waiting for");
      expect(output.error).toEqual([]);
    });

    it("warns when the credits are used up and there was nothing new to start", async () => {
      serve({
        [PATHS.fill]: {
          body: { ...(NO_WORK.body as object), credits: { exhausted: true } },
        },
      });

      expect(await translate(["--no-push"])).toBe(0);
      expect(output.error).toEqual([
        "⚠  Machine translation credits are used up; jobs already in flight may stop.",
      ]);
    });

    it("lists at most 20 problems", async () => {
      const errors = Array.from({ length: 22 }, (_, i) => ({
        keyId: i + 1,
        key: `k${i}`,
        message: "Down",
        type: "provider_error",
      }));
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB, { processed: 0, failed: 22, errors }),
      });

      expect(await translate(["--no-push"])).toBe(1);

      expect(output.error.filter((line) => line.startsWith("✗"))).toHaveLength(20);
      expect(output.error[output.error.length - 1]).toBe("  … and 2 more");
    });

    it("counts a timeout per locale, from what is still empty, not per job", async () => {
      await writeLocale("en", { greeting: "Hello", farewell: "Bye", more: "More" });
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de", keyCount: 3 }]),
        [PATHS.status(DE_JOB)]: waiting(DE_JOB),
        [PATHS.translations]: translationsBody({
          en: { greeting: "Hello", farewell: "Bye", more: "More" },
          de: { greeting: "Hallo" },
        }),
      });

      expect(
        await translate(["--no-push", "-l", "de", "--timeout", "30", "--format", "json"]),
      ).toBe(2);

      // A bare number is seconds: the job was asked about before the deadline.
      expect(statusRequests(DE_JOB)).toBeGreaterThan(1);
      const doc = JSON.parse(output.log[0]);
      expect(doc.pairs.unfinished).toBe(2);
      expect(doc.jobs[0].status).toBe("running");
      expect(doc.errors).toEqual([
        {
          type: "unfinished_running",
          message: "de: 2 values are still empty; its jobs are still running",
          locale: "de",
        },
      ]);
    });

    it("reports an evicted job's locale once in the JSON", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "-l", "de", "--format", "json"])).toBe(1);

      const doc = JSON.parse(output.log[0]);
      expect(doc.pairs).toMatchObject({ unfinished: 1, notOnPlatform: 0 });
      expect(doc.jobs[0].status).toBe("gone");
      expect(doc.errors).toEqual([
        {
          type: "unfinished",
          message: "de: 1 value is still empty after its jobs ended",
          locale: "de",
        },
      ]);
    });

    it("counts a locale once when two of its jobs are gone", async () => {
      const other = "auto-mt-123-de-2";
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: other, targetLocaleCode: "de", owned: false },
        ]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        [PATHS.status(other)]: contract.status.gone,
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "-l", "de", "--format", "json"])).toBe(1);
      expect(JSON.parse(output.log[0]).pairs.unfinished).toBe(1);
    });

    it("one locale, one job gone and one still running: unfinished once, exit 2", async () => {
      const other = "auto-mt-123-de-2";
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: other, targetLocaleCode: "de", owned: false },
        ]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        [PATHS.status(other)]: waiting(other),
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(
        await translate(["--no-push", "-l", "de", "--timeout", "1m", "--format", "json"]),
      ).toBe(2);

      const doc = JSON.parse(output.log[0]);
      expect(doc.pairs.unfinished).toBe(1);
      expect(doc.errors).toEqual([
        {
          type: "unfinished_running",
          message: "de: 1 value is still empty; its jobs are still running",
          locale: "de",
        },
      ]);
    });

    it("does not count the empty values of a locale the platform skipped", async () => {
      serve({
        [PATHS.fill]: {
          body: {
            ...(NO_WORK.body as object),
            skippedLocales: [{ code: "de", reason: "forbidden" }],
          },
        },
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push"])).toBe(0);
    });

    it("judges an evicted job by its own locale only", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        // de is complete; uk is empty, but no job of this run was about uk.
        [PATHS.translations]: translationsBody({ de: { greeting: "Hallo", farewell: "Tschüss" } }),
      });

      expect(await translate(["--no-push"])).toBe(0);
    });

    it("does not blame a completed job for values the platform still lacks", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
        [PATHS.translations]: translationsBody({ de: { greeting: "Hallo" } }),
      });

      expect(await translate(["--no-push", "-l", "de"])).toBe(0);
      // Nothing was written, so there is no "Files changed" line.
      expect(output.stdout).not.toContain("Files changed");
      expect(output.stdout).not.toContain("from the platform");
    });

    it("an evicted job and a failed fetch: exit 2, and nothing is claimed either way", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        [PATHS.translations]: { status: 503, body: {} },
      });

      expect(await translate(["--no-push"])).toBe(2);
      expect(output.stdout).not.toContain("Jobs keep running");
      expect(output.stdout).not.toContain("run `comvi translate` again");
    });

    it("a running job and a failed fetch: exit 2, and the jobs keep running", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: waiting(DE_JOB),
        [PATHS.translations]: { status: 503, body: {} },
      });

      expect(await translate(["--no-push", "--timeout", "10s"])).toBe(2);
      expect(output.stdout).toContain("Jobs keep running");
    });

    it("reports LIMIT_EXCEEDED in the JSON errors", async () => {
      serve({
        [PATHS.fill]: contract.fill.creditsExhausted,
        [PATHS.status("auto-mt-123-uk-77")]: completed("auto-mt-123-uk-77"),
      });

      expect(await translate(["--no-push", "--format", "json"])).toBe(3);

      const doc = JSON.parse(output.log[0]);
      expect(doc.errors).toEqual([
        {
          type: "limit_exceeded",
          message: expect.stringContaining(
            "(LIMIT_EXCEEDED): Machine translation credits are used up",
          ),
        },
      ]);
      expect(doc.pairs.toTranslate).toBe(0);
      expect(doc.skippedLocales).toEqual([]);
    });

    it("spells out MT_FILL_LIMIT with the count and the estimate", async () => {
      serve({ [PATHS.fill]: contract.fill.overLimit });

      expect(await translate(["--no-push"])).toBe(4);

      expect(output.error).toEqual([
        "✗ Translate failed: 2400 key × locale pairs to translate (≈3100 credits), over --max-keys 1000. " +
          "No machine translation was started. Raise --max-keys, narrow the run with --locale or --ns, " +
          "or pass --max-keys 0 for no limit.",
      ]);
    });

    it("names the platform's limit when MT_FILL_LIMIT comes without --max-keys or meta", async () => {
      serve({
        [PATHS.fill]: {
          status: 422,
          body: { code: "MT_FILL_LIMIT", message: "Too many", meta: {} },
        },
      });

      expect(await translate(["--no-push", "--max-keys", "0"])).toBe(4);
      expect(output.stderr).toContain(
        "More key × locale pairs to translate, over the platform's limit.",
      );

      exits.codes.length = 0;
      serve({
        [PATHS.fill]: {
          status: 422,
          body: { code: "MT_FILL_LIMIT", message: "Too many", meta: { pairs: { toTranslate: 5 } } },
        },
      });
      expect(await translate(["--no-push", "--max-keys", "4"])).toBe(4);
      expect(output.stderr).toContain("5 key × locale pairs to translate, over --max-keys 4.");
    });

    it("prints the filters taken from .comvirc.json", async () => {
      await fs.writeFile(
        configPath,
        JSON.stringify({
          apiKey: "k",
          apiBaseUrl: API_BASE_URL,
          translationsPath: localesDir,
          locales: ["de", "uk"],
          namespaces: ["common", "admin"],
        }),
      );
      serve({ [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push"])).toBe(0);

      expect(output.log).toContain("📄 Using locales from .comvirc.json: de, uk");
      expect(output.log).toContain("📄 Using namespaces from .comvirc.json: common, admin");
      expect(fillBodies()).toEqual([
        { targetLocaleCodes: ["de", "uk"], namespaces: ["common", "admin"], maxPairs: 1000 },
      ]);
    });
  });

  describe("more exits", () => {
    it("a network failure on the fill: exit 2", async () => {
      serve({ [PATHS.fill]: { networkError: "ECONNRESET" } });

      expect(await translate(["--no-push"])).toBe(2);
    });

    it("a status the platform refuses as invalid: exit 1", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: { status: 400, body: { code: "BAD_REQUEST", message: "Bad id" } },
      });

      expect(await translate(["--no-push"])).toBe(1);
      expect(statusRequests(DE_JOB)).toBe(1);
    });

    it("a fetch the key may not read: exit 3", async () => {
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: { status: 403, body: { code: "FORBIDDEN", message: "No read" } },
      });

      expect(await translate(["--no-push"])).toBe(3);
    });

    it("a target file it cannot parse: exit 1, the others are written and reported", async () => {
      await writeLocale("uk", {});
      await fs.writeFile(join(localesDir, "uk.json"), "{ broken", "utf-8");
      serve({ [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push", "--format", "json"])).toBe(1);

      const doc = JSON.parse(output.log[0]);
      // de's farewell was written; its local greeting differs from the platform's.
      expect(doc.written).toEqual({ files: 1, values: 1, differ: 1 });
      expect(doc.errors).toEqual([
        {
          type: "write_failed",
          message: expect.stringContaining("uk.json: Invalid JSON"),
          locale: "uk",
        },
      ]);
      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
    });

    it("a project without a source locale: exit 2", async () => {
      serve({ [PATHS.project]: { body: { id: 123 } } });

      expect(await translate(["--no-push"])).toBe(2);
      expect(output.stderr).toContain("did not name the project's source locale");
    });

    it("falls back to sourceLocale in .comvirc.json", async () => {
      await fs.writeFile(
        configPath,
        JSON.stringify({
          apiKey: "k",
          apiBaseUrl: API_BASE_URL,
          translationsPath: localesDir,
          sourceLocale: "en",
        }),
      );
      serve({ [PATHS.project]: { body: { id: 123 } }, [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push"])).toBe(0);
      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
    });

    it("drops the source from -l, and refuses -l with only the source", async () => {
      serve({ [PATHS.fill]: NO_WORK });
      expect(await translate(["--no-push", "-l", "de,en"])).toBe(0);
      expect(fillBodies()).toEqual([{ targetLocaleCodes: ["de"], maxPairs: 1000 }]);

      exits.codes.length = 0;
      serve({ [PATHS.fill]: NO_WORK });
      expect(await translate(["--no-push", "-l", "EN"])).toBe(4);
      expect(http.paths()).not.toContain(PATHS.fill);
    });

    it("fetches the results with the filters", async () => {
      serve({ [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push", "-l", "de", "--ns", "common"])).toBe(0);

      const query = new URL(http.urlFor(PATHS.translations)).searchParams;
      // The source comes too: it tells a translatable gap from one push must fill.
      expect(query.get("locales")).toBe("de,en");
      expect(query.get("namespaces")).toBe("common");
    });

    it("--no-push fills a target value that is null in the local file", async () => {
      await fs.writeFile(
        join(localesDir, "de.json"),
        JSON.stringify({ greeting: "Hallo", farewell: null }),
      );
      serve({ [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push", "-l", "de"])).toBe(0);
      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
    });

    it("never fills the source catalog itself", async () => {
      await writeLocale("en", { greeting: "Hello", farewell: "" });
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: translationsBody({
          en: { greeting: "Hello", farewell: "Bye (platform)" },
          de: { greeting: "Hallo", farewell: "Tschüss" },
          uk: { greeting: "Привіт", farewell: "Бувай" },
        }),
      });

      expect(await translate(["--no-push"])).toBe(0);
      expect(await readLocale("en")).toEqual({ greeting: "Hello", farewell: "" });
    });

    it("writes into a target file under its local spelling", async () => {
      await writeLocale("pt_br", { greeting: "Olá" });
      serve({
        [PATHS.locales]: { body: { locales: [{ code: "en" }, { code: "pt-BR" }] } },
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: {
          body: {
            locales: ["en", "pt-BR"],
            namespaces: { common: { "pt-BR": { greeting: "Oi", farewell: "Tchau" } } },
          },
        },
      });

      expect(await translate(["--no-push", "-l", "pt_br"])).toBe(0);

      expect(fillBodies()).toEqual([{ targetLocaleCodes: ["pt-BR"], maxPairs: 1000 }]);
      expect(await readLocale("pt_br")).toEqual({ greeting: "Olá", farewell: "Tchau" });
      expect(await exists("pt-BR")).toBe(false);
    });

    it("warns and writes nothing without a local source catalog", async () => {
      await fs.rm(join(localesDir, "en.json"));
      serve({ [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push"])).toBe(0);

      expect(output.error).toEqual([
        "⚠  No local catalog for the source locale en: nothing to fill",
      ]);
      expect(await readLocale("de")).toEqual({ greeting: "Hallo" });
    });

    it.each([[["--max-keys", "5x"]], [["--timeout", "x5s"]], [["--timeout", "5sx"]]])(
      "refuses %j before any request",
      async (flags) => {
        serve({});

        expect(await translate(flags)).toBe(4);
        expect(http.requests).toEqual([]);
      },
    );
  });

  describe("polling, in detail", () => {
    function stamped(responses: RouteResponse[], at: number[]): RouteResponse[] {
      return responses.map((response) => ({
        ...response,
        onRequest: () => void at.push(Date.now()),
      }));
    }

    it("starts no request at the deadline, and one just before it", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
      });
      expect(await translate(["--no-push", "--timeout", "2s"])).toBe(0);
      expect(statusRequests(DE_JOB)).toBe(0);

      exits.codes.length = 0;
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
      });
      expect(await translate(["--no-push", "--timeout", "2001ms"])).toBe(0);
      expect(statusRequests(DE_JOB)).toBe(1);
    });

    it("keeps asking every 2 s while a job makes progress", async () => {
      const at: number[] = [];
      const active = (progress: number): RouteResponse => ({
        body: { jobId: DE_JOB, status: "active", progress },
      });
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: stamped(
          [active(10), active(20), active(30), active(40), completed(DE_JOB)],
          at,
        ),
      });

      expect(await translate(["--no-push"])).toBe(0);

      expect(at.slice(1).map((time, i) => time - at[i])).toEqual([2_000, 2_000, 2_000, 2_000]);
    });

    it("backs off on a platform that keeps failing, and gives up at the deadline", async () => {
      const at: number[] = [];
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: stamped([{ status: 503, body: {} }], at),
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "--timeout", "1m"])).toBe(2);

      const gaps = at.slice(1).map((time, i) => time - at[i]);
      expect(gaps.slice(0, 4)).toEqual([3_000, 4_500, 6_750, 10_000]);
      expect(output.stdout).toContain("Jobs keep running");
    });

    it("shows a progress line on a terminal", async () => {
      const writes: string[] = [];
      Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
      vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string) => {
        writes.push(String(chunk));
        return true;
      }) as never);
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: UK_JOB, targetLocaleCode: "uk" },
        ]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
        [PATHS.status(UK_JOB)]: completed(UK_JOB),
      });

      try {
        expect(await translate(["--no-push"])).toBe(0);
      } finally {
        delete (process.stderr as { isTTY?: boolean }).isTTY;
      }

      expect(writes).toEqual(["\r⏳ 1/2 jobs done", "\r⏳ 2/2 jobs done", "\n"]);
    });
  });

  describe("--dry-run, in detail", () => {
    const REMOTE = translationsBody({ en: { greeting: "Hello" }, de: {}, uk: {} });

    beforeEach(async () => {
      await writeLocale("en", { greeting: "Hello", farewell: "Bye" });
      await writeLocale("de", {});
    });

    it("prints one JSON document", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun, [PATHS.translations]: REMOTE });

      expect(await translate(["--dry-run", "--force-mode", "override", "--format", "json"])).toBe(
        0,
      );

      expect(output.log).toHaveLength(1);
      expect(JSON.parse(output.log[0])).toEqual({
        version: 1,
        dryRun: true,
        pairs: { toTranslate: 2, alreadyInFlight: 0, alreadyTranslated: 4, noSource: 0 },
        estimate: { credits: 3, approximate: true },
        preview: { pairs: 2 },
        jobs: [],
        written: false,
        errors: [],
        skippedLocales: [],
        ok: true,
      });
    });

    it("leaves the preview out of the JSON with --no-push, and reports the limit", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun });

      expect(
        await translate(["--dry-run", "--no-push", "--max-keys", "1", "--format", "json"]),
      ).toBe(4);

      const doc = JSON.parse(output.log[0]);
      expect(doc).not.toHaveProperty("preview");
      expect(doc.ok).toBe(false);
      expect(doc.errors).toEqual([
        {
          type: "over_limit",
          message:
            "2 key × locale pairs to translate, over --max-keys 1. Raise --max-keys, narrow the run " +
            "with --locale or --ns, or pass --max-keys 0 for no limit.",
        },
      ]);
    });

    it("is not over the limit at the limit itself", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun, [PATHS.translations]: REMOTE });

      // 2 on the platform and ~2 from the push: exactly 4.
      expect(await translate(["--dry-run", "--force-mode", "override", "--max-keys", "4"])).toBe(0);
      expect(output.error).toEqual([]);

      exits.codes.length = 0;
      serve({ [PATHS.fill]: contract.fill.dryRun });
      expect(await translate(["--dry-run", "--no-push", "--max-keys", "2"])).toBe(0);
    });

    it("prints the lines in full, singular included", async () => {
      await writeLocale("en", { greeting: "Hello" });
      serve({
        [PATHS.fill]: {
          body: {
            ...(contract.fill.dryRun.body as object),
            pairs: { toTranslate: 1, alreadyInFlight: 0, alreadyTranslated: 0, noSource: 0 },
            skippedLocales: [
              { code: "ja", reason: "forbidden" },
              { code: "ko", reason: "forbidden" },
            ],
          },
        },
        [PATHS.translations]: translationsBody({ en: { greeting: "Hello" }, de: {}, uk: {} }),
      });

      expect(await translate(["--dry-run", "--force-mode", "override", "--max-keys", "3"])).toBe(0);

      expect(output.log.slice(-3)).toEqual([
        "\n📊 Translate preview (dry run): nothing is pushed, translated or written",
        "  On the platform: 1 pair, ≈3 credits",
        "  Not yet on the platform (would be pushed): ~0 pairs (preview)",
      ]);
      expect(output.error).toEqual(["⚠  Skipped locales: ja (forbidden), ko (forbidden)"]);
      expect(output.log.some((line) => line.startsWith("{"))).toBe(false);
    });

    it("counts a target the push would empty under override, and not under keep", async () => {
      // The platform has de "Hallo"; the local file has "" for it.
      await writeLocale("en", { greeting: "Hello", blank: "" });
      await writeLocale("de", { greeting: "" });
      const remote = translationsBody({ en: { greeting: "Hello" }, de: { greeting: "Hallo" } });

      serve({ [PATHS.fill]: NO_WORK, [PATHS.translations]: remote });
      expect(await translate(["--dry-run", "--force-mode", "override", "-l", "de"])).toBe(0);
      expect(output.stdout).toContain("(would be pushed): ~1 pair (preview)");

      exits.codes.length = 0;
      output.log.length = 0;
      serve({ [PATHS.fill]: NO_WORK, [PATHS.translations]: remote });
      expect(await translate(["--dry-run", "--force-mode", "keep", "-l", "de"])).toBe(0);
      expect(output.stdout).toContain("(would be pushed): ~0 pairs (preview)");
    });

    it("counts nothing when there is nothing to push", async () => {
      await fs.rm(join(localesDir, "en.json"));
      await fs.rm(join(localesDir, "de.json"));
      serve({ [PATHS.fill]: contract.fill.dryRun });

      expect(await translate(["--dry-run", "--force-mode", "override"])).toBe(0);
      expect(output.stdout).toContain("(would be pushed): ~0 pairs (preview)");
    });
  });

  describe("the command and its errors, word for word", () => {
    it("declares the flags of the plan", () => {
      const command = createTranslateCommand();

      expect(command.name()).toBe("translate");
      expect(command.description()).toBe(
        "Machine-translate missing values on the platform and write them to local files",
      );
      expect(command.options.map((o) => [o.flags, o.description, o.defaultValue])).toEqual([
        ["-c, --config <path>", "Path to .comvirc.json file", undefined],
        ["-l, --locale <locales>", "Target locales (comma-separated)", undefined],
        ["-n, --ns <namespaces>", "Filter by namespaces (comma-separated)", undefined],
        // Commander sets push to true itself when --no-push is absent.
        ["--no-push", "Do not push local files first", undefined],
        [
          "--force-mode <mode>",
          "Conflict resolution for the push: override, keep, ask, abort (default: ask)",
          undefined,
        ],
        ["--max-keys <n>", "Most key × locale pairs to translate; 0 for no limit", "1000"],
        [
          "--dry-run",
          "Count what would be translated; push, translate and write nothing",
          undefined,
        ],
        ["--timeout <duration>", "How long to wait for the jobs, e.g. 90s, 20m, 1h", "20m"],
        ["--format <format>", "Output format: text or json", "text"],
      ]);
    });

    it.each([
      [["--format", "xml"], "Invalid --format: xml. Use: text or json"],
      [["--force-mode", "merge"], "Invalid force-mode: merge. Use: override, keep, ask, or abort"],
      [["--max-keys", "-1"], "Invalid --max-keys: -1. Use a whole number; 0 for no limit"],
      [["--timeout", "soon"], "Invalid --timeout: soon. Use a duration such as 90s, 20m or 1h"],
      [["-l", ""], "--locale was given an empty value; remove the flag to use every item"],
      [["--ns", ""], "--ns was given an empty value; remove the flag to use every item"],
    ])("%j says why", async (flags, message) => {
      serve({});

      expect(await translate(flags)).toBe(4);
      expect(output.error).toEqual([`✗ Translate failed: ${message}`]);
    });

    it("refuses -l with only the source, saying so", async () => {
      serve({});

      expect(await translate(["--no-push", "-l", "en"])).toBe(4);
      expect(output.error).toEqual([
        "✗ Translate failed: --locale names only the source locale en: nothing to translate",
      ]);
    });

    it.each(["keep", "ask", "abort"])("accepts --force-mode %s", async (mode) => {
      serve({ [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push", "--force-mode", mode])).toBe(0);
    });

    it("pushes every namespace of --ns", async () => {
      await fs.mkdir(join(localesDir, "admin"), { recursive: true });
      await fs.writeFile(join(localesDir, "admin/en.json"), JSON.stringify({ title: "Admin" }));
      serve({ [PATHS.fill]: [contract.fill.dryRun, NO_WORK] });

      expect(await translate(["--force-mode", "override", "--ns", "common,admin"])).toBe(0);

      const pushed = http.jsonBodyFor(PATHS.commit).namespaces as Record<string, object>;
      expect(Object.keys(pushed).sort()).toEqual(["admin", "common"]);
    });

    it("a completed job without a result counts nothing and is fine", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: { body: { jobId: DE_JOB, status: "completed" } },
      });

      expect(await translate(["--no-push", "--format", "json"])).toBe(0);
      expect(JSON.parse(output.log[0]).pairs.translated).toBe(0);
    });

    it("a failed job without a reason says so", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: { body: { jobId: DE_JOB, status: "failed" } },
      });

      expect(await translate(["--no-push"])).toBe(1);
      expect(output.error).toContain(`✗ de: job ${DE_JOB} failed: no reason given`);
    });

    it("a key error without a type counts as unknown: exit 1", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB, {
          processed: 0,
          failed: 1,
          errors: [{ keyId: 1, key: "farewell", message: "Odd" }],
        }),
      });

      expect(await translate(["--no-push"])).toBe(1);
      expect(output.error).toContain("✗ de: farewell — Odd (unknown)");
    });

    it("reports a refused status, a failed fetch and a collision by type", async () => {
      await writeLocale("uk", { greeting: "Привіт", nested: { a: "x" } });
      await writeLocale("en", { greeting: "Hello", farewell: "Bye", nested: "N" });
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: { status: 400, body: { code: "BAD_REQUEST", message: "Bad id" } },
        [PATHS.translations]: translationsBody({ uk: { nested: "Вкладене" } }),
      });

      expect(await translate(["--no-push", "--format", "json"])).toBe(1);

      expect(JSON.parse(output.log[0]).errors).toEqual([
        {
          type: "status_failed",
          message: expect.stringMatching(/^de: job fill-123-de-1: .*\(BAD_REQUEST\): Bad id$/),
          jobId: DE_JOB,
          locale: "de",
        },
        {
          type: "collision",
          message: `${join(localesDir, "uk.json")}: "nested" does not fit the file's structure; not written`,
          locale: "uk",
          key: "nested",
        },
      ]);
    });

    it("reports a failed fetch by type", async () => {
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: { status: 400, body: { code: "BAD", message: "No" } },
      });

      expect(await translate(["--no-push", "--format", "json"])).toBe(2);

      expect(JSON.parse(output.log[0]).errors).toEqual([
        {
          type: "fetch_failed",
          message: expect.stringMatching(/\(BAD\): No\. Nothing was written\.$/),
        },
      ]);
    });

    it("lists exactly 20 problems without a 'more' line", async () => {
      const errors = Array.from({ length: 20 }, (_, i) => ({
        keyId: i + 1,
        key: `k${i}`,
        message: "Down",
        type: "provider_error",
      }));
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB, { processed: 0, failed: 20, errors }),
      });

      expect(await translate(["--no-push"])).toBe(1);
      expect(output.error).toHaveLength(20);
    });

    it("writes nothing to stderr directly when it is not a terminal", async () => {
      const write = vi.spyOn(process.stderr, "write");
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
      });

      expect(await translate(["--no-push"])).toBe(0);
      expect(write).not.toHaveBeenCalled();
    });

    it("keeps the 2 s pace while a job changes state, even without progress", async () => {
      const at: number[] = [];
      const stamp = (response: RouteResponse): RouteResponse => ({
        ...response,
        onRequest: () => void at.push(Date.now()),
      });
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: [
          stamp(waiting(DE_JOB)),
          stamp({ body: { jobId: DE_JOB, status: "active" } }),
          stamp(completed(DE_JOB)),
        ],
      });

      expect(await translate(["--no-push"])).toBe(0);
      expect(at.slice(1).map((time, i) => time - at[i])).toEqual([2_000, 2_000]);
    });
  });

  describe("--dry-run, the pushed pairs", () => {
    beforeEach(async () => {
      await writeLocale("en", { greeting: "Hello", farewell: "Bye" });
      await writeLocale("de", {});
    });

    it("counts a project locale that has no values anywhere yet", async () => {
      serve({
        [PATHS.locales]: {
          body: { locales: ["en", "de", "uk", "fr"].map((code) => ({ code })) },
        },
        [PATHS.fill]: contract.fill.dryRun,
        [PATHS.translations]: translationsBody({ en: { greeting: "Hello" }, de: {}, uk: {} }),
      });

      expect(await translate(["--dry-run", "--force-mode", "override"])).toBe(0);
      // farewell × de, uk and fr.
      expect(output.stdout).toContain("(would be pushed): ~3 pairs (preview)");
    });

    it.each([
      [["--force-mode", "override"]],
      [["--dry-run", "--force-mode", "override"]],
      [["--no-push"]],
    ])(
      "%j on a platform that cannot list its locales, without -l: exit 4 before any push or MT",
      async (flags) => {
        serve({ [PATHS.locales]: { status: 404, body: {} }, [PATHS.fill]: NO_WORK });

        expect(await translate(flags)).toBe(4);

        expect(output.error).toEqual([
          "✗ Translate failed: The platform does not support comvi translate: it cannot list the project's locales.",
        ]);
        expect(http.paths()).not.toContain(PATHS.fill);
        expect(http.paths()).not.toContain(PATHS.commit);
      },
    );
  });

  describe("the last edges", () => {
    it("--dry-run on a platform without mt/fill: exit 4", async () => {
      serve({ [PATHS.fill]: contract.fill.routeNotFound });

      expect(await translate(["--dry-run", "--force-mode", "override"])).toBe(4);
      expect(output.error).toEqual([
        "✗ Translate failed: The platform does not support comvi translate: POST mt/fill answered 404. " +
          "Update the platform, or check apiBaseUrl.",
      ]);
      expect(fillBodies()).toEqual([{ dryRun: true }]);
      expect(http.paths()).not.toContain(PATHS.translations);
    });

    it("keeps -l as given when the platform does not list its locales", async () => {
      serve({ [PATHS.locales]: { status: 404, body: {} }, [PATHS.fill]: NO_WORK });

      expect(await translate(["--no-push", "-l", "de"])).toBe(0);
      expect(fillBodies()).toEqual([{ targetLocaleCodes: ["de"], maxPairs: 1000 }]);
    });

    it("MT_FILL_LIMIT without any meta still exits 4 with the limit", async () => {
      serve({
        [PATHS.fill]: { status: 422, body: { code: "MT_FILL_LIMIT", message: "Too many" } },
      });

      expect(await translate(["--no-push"])).toBe(4);
      expect(output.stderr).toContain(
        "More key × locale pairs to translate, over --max-keys 1000. No machine translation was started.",
      );
    });
  });

  describe("the platform's P3 decisions", () => {
    it("nothing new, credits used up, a foreign job still covering pairs: collected, exit 0", async () => {
      serve({
        [PATHS.fill]: contract.fill.nothingNewInFlight,
        [PATHS.status("auto-mt-123-de-9")]: completed("auto-mt-123-de-9"),
      });

      expect(await translate(["--no-push"])).toBe(0);

      expect(statusRequests("auto-mt-123-de-9")).toBe(1);
      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
      expect(output.error).toEqual([
        "⚠  Machine translation credits are used up; jobs already in flight may stop.",
      ]);
    });

    it("an unknown target locale (LOCALE_NOT_FOUND): exit 4 before the push", async () => {
      serve({ [PATHS.fill]: contract.fill.unknownLocale });

      expect(await translate(["--force-mode", "override", "-l", "xx"])).toBe(4);
      expect(http.paths()).not.toContain(PATHS.commit);
    });
  });

  describe("review round", () => {
    it("two catalogs in one file: exit 4 before any push or MT, and no file changes", async () => {
      await fs.rm(localesDir, { recursive: true, force: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({
          apiKey: "k",
          apiBaseUrl: API_BASE_URL,
          translationsPath: localesDir,
          fileTemplate: "{namespace}-{languageTag}.json",
        }),
      );
      await fs.mkdir(localesDir, { recursive: true });
      await fs.writeFile(join(localesDir, "common-en.json"), JSON.stringify({ a: "A" }));
      await fs.writeFile(join(localesDir, "common-en-en.json"), JSON.stringify({ b: "B" }));
      await fs.writeFile(join(localesDir, "common-en-ca.json"), JSON.stringify({ a: "Kept" }));
      const before = (await fs.readdir(localesDir)).sort();
      serve({
        [PATHS.locales]: {
          body: { locales: ["en", "ca", "en-ca"].map((code) => ({ code })) },
        },
        [PATHS.fill]: NO_WORK,
      });

      expect(await translate(["--force-mode", "override"])).toBe(4);

      expect(output.stderr).toContain("both resolve to");
      expect(http.paths()).not.toContain(PATHS.fill);
      expect(http.paths()).not.toContain(PATHS.commit);
      expect((await fs.readdir(localesDir)).sort()).toEqual(before);
      expect(JSON.parse(await fs.readFile(join(localesDir, "common-en-ca.json"), "utf-8"))).toEqual(
        {
          a: "Kept",
        },
      );
    });

    it("a write phase that throws: exit 1, written: false, and the summary still prints", async () => {
      serve({
        [PATHS.fill]: NO_WORK,
        // A locale the response names that cannot be a file name.
        [PATHS.translations]: {
          body: {
            locales: ["en", "de", ".."],
            namespaces: { common: { de: { farewell: "Tschüss" } } },
          },
        },
      });

      expect(await translate(["--no-push", "--format", "json"])).toBe(1);

      const doc = JSON.parse(output.log[0]);
      expect(doc.written).toBe(false);
      expect(doc.errors).toEqual([
        { type: "write_failed", message: expect.stringContaining("Nothing was written.") },
      ]);
      expect(await readLocale("de")).toEqual({ greeting: "Hallo" });
      expect(output.stderr).toContain("Translate finished with problems");
    });

    it("a write phase that throws after the first file: exit 1, and the written file is reported", async () => {
      serve({ [PATHS.fill]: NO_WORK });
      mergeFault.error = new Error("disk full");

      expect(await translate(["--no-push", "--format", "json"])).toBe(1);

      const doc = JSON.parse(output.log[0]);
      expect(doc.errors).toEqual([
        {
          type: "write_failed",
          message: "Writing stopped: disk full. 1 file was already written.",
        },
      ]);
      // de is written first; uk was never reached.
      expect(doc.written).toEqual({ files: 1, values: 1, differ: 1 });
      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
      expect(await exists("uk")).toBe(false);
      expect(output.stderr).not.toContain("Nothing was written");
    });

    it("a throw after two written files counts only the written ones, and every judged differ", async () => {
      // fr only differs (nothing to fill), then de and uk are written.
      await writeLocale("fr", { greeting: "Lokal", farewell: "Lokal" });
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.locales]: {
          body: { locales: [{ code: "en" }, { code: "fr" }, { code: "de" }, { code: "uk" }] },
        },
        [PATHS.translations]: {
          body: {
            locales: ["en", "fr", "de", "uk"],
            namespaces: {
              common: {
                en: { greeting: "Hello", farewell: "Bye" },
                fr: { greeting: "Bonjour", farewell: "Salut" },
                de: { greeting: "Hallo (platform)", farewell: "Tschüss" },
                uk: { greeting: "Привіт", farewell: "Бувай" },
              },
            },
          },
        },
      });
      mergeFault.error = new Error("disk full");
      mergeFault.afterWrites = 2;

      expect(await translate(["--no-push", "--format", "json"])).toBe(1);

      const doc = JSON.parse(output.log[0]);
      expect(doc.errors).toEqual([
        {
          type: "write_failed",
          message: "Writing stopped: disk full. 2 files were already written.",
        },
      ]);
      // de 1 + uk 2 values; fr's two and de's greeting differ.
      expect(doc.written).toEqual({ files: 2, values: 3, differ: 3 });
      expect(await readLocale("uk")).toEqual({ greeting: "Привіт", farewell: "Бувай" });
    });

    it("the second file's write fails: exit 1, the first is written and reported", async () => {
      serve({ [PATHS.fill]: NO_WORK });
      mergeFault.failWrite = "uk.json";

      expect(await translate(["--no-push", "--format", "json"])).toBe(1);

      const doc = JSON.parse(output.log[0]);
      expect(doc.written).toEqual({ files: 1, values: 1, differ: 1 });
      expect(doc.errors).toEqual([
        {
          type: "write_failed",
          message: expect.stringMatching(/uk\.json: EACCES: permission denied$/),
          locale: "uk",
        },
      ]);
      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
      expect(await exists("uk")).toBe(false);
    });

    it("refuses --force-mode ask with --format json, before any request", async () => {
      serve({});

      expect(await translate(["--format", "json"])).toBe(4);

      expect(JSON.parse(output.log[0]).errors[0].message).toBe(
        "--format json cannot answer the conflict prompt of --force-mode ask, the default. " +
          "Pass --force-mode override, keep or abort, or --no-push.",
      );
      expect(http.requests).toEqual([]);
    });

    it.each([[["--no-push"]], [["--dry-run"]], [["--force-mode", "keep"]]])(
      "accepts --format json with %j",
      async (flags) => {
        serve({ [PATHS.fill]: [contract.fill.dryRun, NO_WORK] });

        expect(await translate(["--format", "json", ...flags])).toBe(0);
      },
    );

    const NAMESPACES: RouteResponse = {
      body: ["common", "admin"].map((namespace, i) => ({
        id: i + 1,
        projectId: 123,
        namespace,
        description: null,
        isDefault: i === 0,
        createdAt: "2026-10-01T00:00:00.000Z",
      })),
    };

    it("--dry-run with the push counts only the --ns namespaces the platform has", async () => {
      // `fresh` exists only locally: the push would create it, and the push
      // preview counts its pairs. The stub answers the same whatever the body,
      // so the body is what proves the platform count covers `common` alone.
      serve({ [PATHS.namespaces]: NAMESPACES, [PATHS.fill]: contract.fill.dryRun });
      expect(
        await translate(["--dry-run", "--force-mode", "override", "--ns", "common,fresh"]),
      ).toBe(0);
      expect(fillBodies()).toEqual([{ dryRun: true, namespaces: ["common"] }]);
    });

    it("--dry-run stops when the namespaces cannot be read, before any fill", async () => {
      // The first read (the default namespace, in setup) succeeds; the dry
      // run's own read is the one that fails.
      serve({ [PATHS.namespaces]: [NAMESPACES, { status: 503, body: { error: "unavailable" } }] });
      expect(await translate(["--dry-run", "--force-mode", "override", "--ns", "common"])).toBe(2);
      expect(fillBodies()).toEqual([]);

      exits.codes.length = 0;
      serve({
        [PATHS.namespaces]: [
          NAMESPACES,
          { status: 403, body: { code: "FORBIDDEN", message: "forbidden" } },
        ],
      });
      expect(await translate(["--dry-run", "--force-mode", "override", "--ns", "common"])).toBe(3);
      expect(fillBodies()).toEqual([]);
    });

    it("--dry-run with the push and only new --ns namespaces counts nothing on the platform", async () => {
      serve({ [PATHS.namespaces]: NAMESPACES, [PATHS.fill]: contract.fill.dryRun });
      expect(await translate(["--dry-run", "--force-mode", "override", "--ns", "fresh"])).toBe(0);
      // The fill still checks the key and the platform, but its count is not used.
      expect(fillBodies()).toEqual([{ dryRun: true }]);
      expect(output.stdout).toContain("On the platform: 0 pairs, ≈0 credits");
    });

    it("--dry-run without --ns counts every namespace; --no-push sends --ns as given", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun });
      expect(await translate(["--dry-run", "--force-mode", "override"])).toBe(0);
      expect(fillBodies()).toEqual([{ dryRun: true }]);

      exits.codes.length = 0;
      serve({ [PATHS.fill]: contract.fill.dryRun });
      expect(await translate(["--dry-run", "--no-push", "--ns", "common"])).toBe(0);
      expect(fillBodies()).toEqual([{ dryRun: true, namespaces: ["common"] }]);
    });

    it("a status request that stalls near the deadline is cut at the deadline", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });
      const routed = globalThis.fetch;
      const asked: number[] = [];
      const cut: number[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string | URL, init: RequestInit = {}) => {
          if (new URL(String(input)).pathname !== PATHS.status(DE_JOB)) return routed(input, init);
          asked.push(Date.now());
          return new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              cut.push(Date.now());
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          });
        }),
      );
      // The client timeout is 30 s; the run has 3 s, and 1 s is left at the first poll.
      expect(await translate(["--no-push", "--timeout", "3s"])).toBe(2);

      expect(asked).toHaveLength(1);
      expect(cut[0] - asked[0]).toBe(1_000);
      expect(output.stdout).toContain("Jobs keep running");
    });

    it("a malformed status ends that job at once, unverifiable: exit 2, not retried", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed("someone-else"),
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "--format", "json"])).toBe(2);

      expect(statusRequests(DE_JOB)).toBe(1);
      const doc = JSON.parse(output.log[0]);
      expect(doc.jobs[0].status).toBe("unverifiable");
      expect(doc.pairs).toMatchObject({ unfinished: 0, unverifiable: 1 });
      expect(doc.errors).toEqual([
        {
          type: "status_invalid",
          message: expect.stringMatching(/^de: job fill-123-de-1: .*not in the expected shape$/),
          jobId: DE_JOB,
          locale: "de",
        },
        {
          type: "unverifiable",
          message: "de: 1 value is still empty; its job's status could not be read",
          locale: "de",
        },
      ]);
    });

    it("a malformed status next to a confirmed failure: exit 1", async () => {
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: UK_JOB, targetLocaleCode: "uk" },
        ]),
        [PATHS.status(DE_JOB)]: completed("someone-else"),
        [PATHS.status(UK_JOB)]: { body: { jobId: UK_JOB, status: "failed", error: "Boom" } },
      });

      expect(await translate(["--no-push"])).toBe(1);
    });

    it("waits out a 429's Retry-After within the budget", async () => {
      const at: number[] = [];
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: [
          {
            status: 429,
            body: {},
            headers: { "retry-after": "7" },
            onRequest: () => void at.push(Date.now()),
          },
          { ...completed(DE_JOB), onRequest: () => void at.push(Date.now()) },
        ],
      });

      expect(await translate(["--no-push"])).toBe(0);
      expect(at[1] - at[0]).toBe(7_000);
    });

    it("counts a Retry-After from when the answer arrived, not from the request", async () => {
      const at: number[] = [];
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: [
          {
            status: 429,
            body: {},
            headers: { "retry-after": "7" },
            // The platform takes 5 s to answer.
            onRequest: async () => {
              at.push(Date.now());
              await new Promise((resolve) => setTimeout(resolve, 5_000));
            },
          },
          { ...completed(DE_JOB), onRequest: () => void at.push(Date.now()) },
        ],
      });

      expect(await translate(["--no-push"])).toBe(0);
      expect(at[1] - at[0]).toBe(12_000);
    });

    it("gives up when a Retry-After reaches past the deadline", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: [
          { status: 429, body: {}, headers: { "retry-after": "30" } },
          completed(DE_JOB),
        ],
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "--timeout", "20s"])).toBe(2);
      expect(statusRequests(DE_JOB)).toBe(1);
    });
  });

  describe("review round, attribution and listing", () => {
    it.each([
      [["de,de"], ["de"]],
      [["pt_br,pt-BR"], ["pt-BR"]],
    ])("-l %j asks for each locale once: %j", async ([locales], expected) => {
      await writeLocale("pt_br", { greeting: "Olá" });
      serve({
        [PATHS.locales]: {
          body: { locales: ["en", "de", "pt-BR"].map((code) => ({ code })) },
        },
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: {
          body: {
            locales: ["en", "de", "pt-BR"],
            namespaces: {
              common: {
                en: { greeting: "Hello", farewell: "Bye" },
                de: { greeting: "Hallo", farewell: "Tschüss" },
                "pt-BR": { greeting: "Oi", farewell: "Tchau" },
              },
            },
          },
        },
      });

      expect(await translate(["--no-push", "-l", locales])).toBe(0);
      expect(fillBodies()).toEqual([{ targetLocaleCodes: expected, maxPairs: 1000 }]);
    });

    it("--dry-run sends the target locales", async () => {
      serve({ [PATHS.fill]: contract.fill.dryRun });

      expect(await translate(["--dry-run", "--no-push", "-l", "de"])).toBe(0);
      expect(fillBodies()).toEqual([{ dryRun: true, targetLocaleCodes: ["de"] }]);
    });

    it("a job running for another locale does not keep this locale's gap running", async () => {
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: UK_JOB, targetLocaleCode: "uk" },
        ]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        [PATHS.status(UK_JOB)]: waiting(UK_JOB),
        [PATHS.translations]: DE_FAREWELL_EMPTY(),
      });

      expect(await translate(["--no-push", "--timeout", "30s"])).toBe(1);

      expect(output.error).toContain("✗ de: 1 value is still empty after its jobs ended");
      expect(output.stdout).not.toContain("Jobs keep running");
    });

    it("a failed fetch keeps the jobs running when any one of them still runs", async () => {
      serve({
        [PATHS.fill]: fillResponse([
          { jobId: DE_JOB, targetLocaleCode: "de" },
          { jobId: UK_JOB, targetLocaleCode: "uk" },
        ]),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
        [PATHS.status(UK_JOB)]: waiting(UK_JOB),
        [PATHS.translations]: { status: 503, body: {} },
      });

      expect(await translate(["--no-push", "--timeout", "30s"])).toBe(2);
      expect(output.stdout).toContain("Jobs keep running");
    });

    it("an empty source on the platform is no source: push first, exit 0", async () => {
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: translationsBody({
          en: { greeting: "Hello", farewell: "" },
          de: { greeting: "Hallo" },
          uk: { greeting: "Привіт" },
        }),
      });

      expect(await translate(["--no-push"])).toBe(0);
      expect(output.error).toEqual([
        "⚠  2 empty values have no source on the platform; push first: de: farewell, uk: farewell",
      ]);
    });

    it("lists ten values without a source, then how many more", async () => {
      const keys = Array.from({ length: 11 }, (_, i) => `k${String(i).padStart(2, "0")}`);
      await writeLocale("en", Object.fromEntries(keys.map((key) => [key, key])));
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: translationsBody({ en: {}, de: {} }),
      });

      expect(await translate(["--no-push", "-l", "de"])).toBe(0);

      expect(output.error).toEqual([
        `⚠  11 empty values have no source on the platform; push first: ${keys
          .slice(0, 10)
          .map((key) => `de: ${key}`)
          .join(", ")}, … and 1 more`,
      ]);
    });

    it("lists exactly ten values without a 'more'", async () => {
      const keys = Array.from({ length: 10 }, (_, i) => `k${i}`);
      await writeLocale("en", Object.fromEntries(keys.map((key) => [key, key])));
      serve({
        [PATHS.fill]: NO_WORK,
        [PATHS.translations]: translationsBody({ en: {}, de: {} }),
      });

      expect(await translate(["--no-push", "-l", "de"])).toBe(0);
      expect(output.error[0]).not.toContain("more");
    });
  });

  describe("a busy project", () => {
    it("busy, then free: one enqueue and the run goes on", async () => {
      serve({
        [PATHS.fill]: [
          contract.fill.busy,
          fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        ],
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
      });

      expect(await translate(["--no-push"])).toBe(0);
      expect(fillBodies()).toEqual([{ maxPairs: 1000 }, { maxPairs: 1000 }]);
      expect(statusRequests(DE_JOB)).toBe(1);
    });

    it("busy three times: exit 2, no push, and it says why", async () => {
      serve({ [PATHS.fill]: contract.fill.busy });

      expect(await translate(["--force-mode", "override"])).toBe(2);

      expect(fillBodies()).toHaveLength(3);
      expect(http.paths()).not.toContain(PATHS.commit);
      expect(output.error).toEqual([
        "✗ Translate failed: The project is busy with another translation request; try again.",
      ]);
    });
  });

  describe("locales the platform could not queue", () => {
    function partialFill(): RouteResponse {
      const queued = fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]);
      return {
        ...queued,
        body: {
          ...(queued.body as object),
          failedLocales: [{ targetLocaleCode: "uk", reason: "enqueue_failed" }],
        },
      };
    }

    it("polls and writes what was queued, and exits 1 for the rest", async () => {
      serve({
        [PATHS.fill]: partialFill(),
        [PATHS.status(DE_JOB)]: completed(DE_JOB),
        [PATHS.translations]: translationsBody({
          en: { greeting: "Hello", farewell: "Bye" },
          de: { greeting: "Hallo", farewell: "Tschüss" },
          uk: {},
        }),
      });

      expect(await translate(["--no-push", "--format", "json"])).toBe(1);

      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
      const doc = JSON.parse(output.log[0]);
      expect(doc.errors).toEqual([
        {
          type: "enqueue_failed",
          message: "uk: could not be queued (enqueue_failed)",
          locale: "uk",
        },
      ]);
      expect(doc.pairs.unfinished).toBe(2);
      expect(output.error).toContain(
        "⚠  1 locale could not be queued; run `comvi translate` again.",
      );
      expect(output.stderr).not.toContain("still empty after its jobs ended");
    });

    it("counts two locales in the plural", async () => {
      const queued = fillResponse([]);
      serve({
        [PATHS.fill]: {
          ...queued,
          body: {
            ...(queued.body as object),
            failedLocales: [
              { targetLocaleCode: "de", reason: "enqueue_failed" },
              { targetLocaleCode: "uk", reason: "enqueue_failed" },
            ],
          },
        },
      });

      expect(await translate(["--no-push"])).toBe(1);
      expect(output.error).toContain(
        "⚠  2 locales could not be queued; run `comvi translate` again.",
      );
    });

    it("a malformed status with nothing left empty is still unverifiable: exit 2", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: completed("someone-else"),
      });

      expect(await translate(["--no-push"])).toBe(2);
    });
  });
});
