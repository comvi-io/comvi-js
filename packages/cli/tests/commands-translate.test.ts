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
        [PATHS.status(DE_JOB)]: contract.status.failed,
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

    it("an evicted job whose target is still empty: exit 1, and the work is unfinished", async () => {
      serve({
        [PATHS.fill]: fillResponse([{ jobId: DE_JOB, targetLocaleCode: "de" }]),
        [PATHS.status(DE_JOB)]: contract.status.gone,
        [PATHS.translations]: translationsBody({ de: { greeting: "Hallo" }, uk: {} }),
      });

      expect(await translate(["--no-push", "-l", "de"])).toBe(1);

      expect(statusRequests(DE_JOB)).toBe(1);
      expect(output.stdout).toContain("Jobs keep running");
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
      });

      expect(await translate(["--no-push", "--timeout", "30s"])).toBe(2);

      expect(await readLocale("de")).toEqual({ greeting: "Hallo", farewell: "Tschüss" });
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
      expect(output.stderr).toContain("may go over --max-keys 3");
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

      const doc = json();
      expect(doc).toMatchObject({ version: 1, ok: false, written: false, jobs: [] });
      expect((doc.errors as Array<{ message: string }>)[0].message).toContain(
        "does not support comvi translate",
      );
    });
  });
});
