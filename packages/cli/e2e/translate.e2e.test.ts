import { afterEach, describe, expect, it } from "vitest";
import {
  createProject,
  createWorkspace,
  enableMachineTranslation,
  fetchRemote,
  listKeys,
  mtCreditsUsed,
  runCli,
  setMtCredits,
  startProxy,
  valueOrigin,
  type CliOptions,
  type E2EProject,
  type Workspace,
} from "./harness";

// The platform runs with MT_FAKE_PROVIDER=1: Google answers `[<locale>] <text>`,
// a source containing `__fail__` comes back as no_translation, and credits are
// real. Google bills 2 credits per source character for each key × locale pair.
const credits = (...sources: string[]) => sources.reduce((sum, text) => sum + 2 * text.length, 0);

const NS = "app";
const file = (locale: string) => `src/locales/${NS}/${locale}.json`;

const cleanups: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

interface Setup {
  project: E2EProject;
  mtKey: string;
  ws: Workspace;
}

/** A fresh project with de and fr, Google on, a key with mt:use, and the given balance. */
async function setup({
  autoApply = false,
  balance = 10_000,
}: { autoApply?: boolean; balance?: number } = {}): Promise<Setup> {
  const project = await createProject({ locales: ["de", "fr"] });
  const mtKey = await enableMachineTranslation(project, { autoApply });
  await setMtCredits(balance);
  const ws = await createWorkspace({ translationsPath: "./src/locales" });
  cleanups.push(() => ws.cleanup());
  return { project, mtKey, ws };
}

function translate(
  ws: Workspace,
  apiKey: string,
  args: string[],
  options: Partial<CliOptions> = {},
) {
  return runCli(["translate", ...args], { cwd: ws.dir, apiKey, ...options });
}

/** The namespace's non-empty values per locale on the platform. */
async function remote(project: E2EProject): Promise<Record<string, Record<string, string>>> {
  const locales = (await fetchRemote(project.keys.full))[NS] ?? {};
  return Object.fromEntries(
    Object.entries(locales)
      .map(([locale, values]) => [
        locale,
        Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")),
      ])
      .filter(([, values]) => Object.keys(values).length > 0),
  );
}

async function readOrNull(ws: Workspace, path: string): Promise<Record<string, string> | null> {
  try {
    return await ws.readJson(path);
  } catch {
    return null;
  }
}

/** What a dry run with the mt:use key counts on the platform now. */
async function platformCount(ws: Workspace, mtKey: string) {
  const result = await translate(ws, mtKey, ["--dry-run", "--no-push", "--format", "json"]);
  expect(result.code, result.stdout + result.stderr).toBe(0);
  return (JSON.parse(result.stdout) as { pairs: Record<string, number> }).pairs;
}

describe("comvi translate", () => {
  it("pushes new keys, translates them and writes only the missing values", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { greeting: "Hello", bye: "Bye" });
    await ws.write(file("de"), { greeting: "Hallo" });

    const result = await translate(ws, mtKey, ["--force-mode", "override"]);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("Translate complete!");
    expect(await ws.readJson(file("de"))).toEqual({ greeting: "Hallo", bye: "[de] Bye" });
    expect(await ws.readJson(file("fr"))).toEqual({ greeting: "[fr] Hello", bye: "[fr] Bye" });
    expect(await ws.readJson(file("en"))).toEqual({ greeting: "Hello", bye: "Bye" });

    expect(await remote(project)).toEqual({
      en: { greeting: "Hello", bye: "Bye" },
      de: { greeting: "Hallo", bye: "[de] Bye" },
      fr: { greeting: "[fr] Hello", bye: "[fr] Bye" },
    });
    const keys = await listKeys(project);
    const bye = keys.find((key) => key.key === "bye")!;
    const greeting = keys.find((key) => key.key === "greeting")!;
    expect(bye.translations.de.status).toBe("not_reviewed");
    expect(bye.translations.fr.status).toBe("not_reviewed");
    expect(greeting.translations.fr.status).toBe("not_reviewed");
    expect(await valueOrigin(project, bye.id, "de")).toBe("machine");
    expect(await valueOrigin(project, greeting.id, "fr")).toBe("machine");
    // The pushed human value is not touched.
    expect(greeting.translations.de.status).toBe("translated");
    expect(await valueOrigin(project, greeting.id, "de")).not.toBe("machine");

    expect(await mtCreditsUsed(project)).toBe(credits("Bye", "Hello", "Bye"));
  });

  it("charges each pair once with autoApply on, through translate and after a plain push", async () => {
    const { project, mtKey, ws } = await setup({ autoApply: true });
    await ws.write(file("en"), { one: "First" });

    const run = await translate(ws, mtKey, ["--force-mode", "override", "--format", "json"]);

    expect(run.code, run.stdout + run.stderr).toBe(0);
    const report = JSON.parse(run.stdout) as {
      jobs: Array<{ targetLocaleCode: string; owned: boolean; keyCount: number }>;
    };
    // One job per locale, both started by this run: the push started no auto-MT.
    expect(
      report.jobs.map(({ targetLocaleCode, owned, keyCount }) => ({
        targetLocaleCode,
        owned,
        keyCount,
      })),
    ).toEqual(
      expect.arrayContaining([
        { targetLocaleCode: "de", owned: true, keyCount: 1 },
        { targetLocaleCode: "fr", owned: true, keyCount: 1 },
      ]),
    );
    expect(report.jobs).toHaveLength(2);
    expect(await mtCreditsUsed(project)).toBe(credits("First", "First"));

    // A plain push starts auto-MT; translate then waits for those jobs and
    // starts none of its own for the same pairs.
    await ws.write(file("en"), { one: "First", two: "Second" });
    const push = await runCli(["push", "--force-mode", "override"], {
      cwd: ws.dir,
      apiKey: mtKey,
    });
    expect(push.code, push.stdout + push.stderr).toBe(0);
    // The push queues auto-MT after it answers: wait until the platform has
    // claimed both new pairs, in flight or done.
    const deadline = Date.now() + 30_000;
    while ((await platformCount(ws, mtKey)).toTranslate > 0) {
      if (Date.now() > deadline) throw new Error("auto-MT did not claim the pushed pairs");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
    const after = await translate(ws, mtKey, ["--no-push", "--format", "json"]);

    expect(after.code, after.stdout + after.stderr).toBe(0);
    const second = JSON.parse(after.stdout) as {
      pairs: { toTranslate: number };
      jobs: Array<{ owned: boolean }>;
    };
    expect(second.pairs.toTranslate).toBe(0);
    expect(second.jobs.filter((job) => job.owned)).toEqual([]);
    expect(await ws.readJson(file("de"))).toEqual({ one: "[de] First", two: "[de] Second" });
    expect(await ws.readJson(file("fr"))).toEqual({ one: "[fr] First", two: "[fr] Second" });
    // Settle: a duplicate job would charge after translate returned.
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000));
    expect(await mtCreditsUsed(project)).toBe(credits("First", "First", "Second", "Second"));
  });

  it("exits 3 when the credits run out, writes what was translated and says to top up", async () => {
    const sources = { k1: "Hello", k2: "Hello", k3: "Hello", k4: "Hello" };
    // Each pair costs 10 credits; 8 pairs need 80.
    const { project, mtKey, ws } = await setup({ balance: 25 });
    await ws.write(file("en"), sources);

    const result = await translate(ws, mtKey, ["--force-mode", "override"]);

    expect(result.code, result.stdout + result.stderr).toBe(3);
    expect(result.stderr).toContain("insufficient_credits");
    expect(result.stderr).toContain("Top up machine translation credits");

    const onPlatform = await remote(project);
    let written = 0;
    for (const locale of ["de", "fr"]) {
      const local = (await readOrNull(ws, file(locale))) ?? {};
      // The files hold exactly what the platform translated, nothing invented.
      expect(local).toEqual(onPlatform[locale] ?? {});
      for (const value of Object.values(local)) expect(value).toBe(`[${locale}] Hello`);
      written += Object.keys(local).length;
    }
    expect(written).toBeGreaterThanOrEqual(1);
    expect(written).toBeLessThan(8);
  });

  it("exits 1 when a value fails to translate and still writes the others", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { ok: "Fine", bad: "Broken __fail__" });

    const result = await translate(ws, mtKey, ["--force-mode", "override", "-l", "de"]);

    expect(result.code, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain("no_translation");
    expect(result.stderr).toMatch(/de: bad/);
    expect(await ws.readJson(file("de"))).toEqual({ ok: "[de] Fine" });
    expect((await remote(project)).de).toEqual({ ok: "[de] Fine" });
    expect(await readOrNull(ws, file("fr"))).toBeNull();
    // The failed call is refunded.
    expect(await mtCreditsUsed(project)).toBe(credits("Fine"));
  });

  it("exits 3 in the preflight for a key without mt:use, before any push", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { a: "Alpha" });
    await ws.write(file("de"), {});

    const result = await translate(ws, project.keys.full, ["--force-mode", "override"]);

    expect(result.code, result.stdout + result.stderr).toBe(3);
    expect(result.stderr).toContain("mt:use");
    expect(result.stdout).not.toContain("Pushing translations");
    expect(await remote(project)).toEqual({});
    expect(await ws.readJson(file("de"))).toEqual({});
    expect(await readOrNull(ws, file("fr"))).toBeNull();
    expect(await mtCreditsUsed(project)).toBe(0);
    // Nothing is queued: the platform has nothing in flight.
    expect(await platformCount(ws, mtKey)).toMatchObject({ toTranslate: 0, alreadyInFlight: 0 });
  });

  it("exits 4 over --max-keys after the push, starting no machine translation", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { a: "Alpha", b: "Beta" });

    const result = await translate(ws, mtKey, ["--force-mode", "override", "--max-keys", "3"]);

    expect(result.code, result.stdout + result.stderr).toBe(4);
    expect(result.stderr).toContain("4 key × locale pairs to translate");
    expect(result.stderr).toContain("over --max-keys 3");
    expect(result.stderr).toContain("No machine translation was started");
    // The push ran (the limit is checked on the platform, after it); no MT did.
    expect(await remote(project)).toEqual({ en: { a: "Alpha", b: "Beta" } });
    expect(await readOrNull(ws, file("de"))).toBeNull();
    expect(await readOrNull(ws, file("fr"))).toBeNull();
    expect(await mtCreditsUsed(project)).toBe(0);
    expect(await platformCount(ws, mtKey)).toMatchObject({ toTranslate: 4, alreadyInFlight: 0 });
  });

  it("keeps a local edit made while the jobs run", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { greeting: "Hello", bye: "Bye" });

    // The first status request is held until the file is edited: the edit
    // lands after the jobs were queued and before the results are written.
    let statusSeen!: () => void;
    const seen = new Promise<void>((resolveSeen) => (statusSeen = resolveSeen));
    let editDone!: () => void;
    const edited = new Promise<void>((resolveEdit) => (editDone = resolveEdit));
    const proxy = await startProxy(undefined, async (req) => {
      if (req.method === "GET" && req.url?.includes("/keys/batch/mt/")) {
        statusSeen();
        await edited;
      }
    });
    cleanups.push(() => proxy.close());

    const running = translate(ws, mtKey, ["--force-mode", "override"], {
      env: { COMVI_API_BASE_URL: proxy.url },
    });
    await seen;
    await ws.write(file("de"), { bye: "Tschüss" });
    editDone();
    const result = await running;

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(await ws.readJson(file("de"))).toEqual({ bye: "Tschüss", greeting: "[de] Hello" });
    expect(await ws.readJson(file("fr"))).toEqual({ greeting: "[fr] Hello", bye: "[fr] Bye" });
    expect(result.stdout).toContain("1 differs from the platform; `comvi pull` will update it.");
    expect((await remote(project)).de).toEqual({ greeting: "[de] Hello", bye: "[de] Bye" });
  });

  it("--dry-run counts both sides and pushes, translates and writes nothing", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { a: "Alpha" });
    const push = await runCli(["push", "--force-mode", "override"], {
      cwd: ws.dir,
      apiKey: mtKey,
    });
    expect(push.code, push.stdout + push.stderr).toBe(0);
    await ws.write(file("en"), { a: "Alpha", b: "Beta" });
    await ws.write(file("de"), { b: "Beta de" });

    const result = await translate(ws, mtKey, ["--dry-run", "--force-mode", "override"]);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    // a × de, fr on the platform; b × fr only after the push (b × de is local).
    expect(result.stdout).toContain(
      `On the platform: 2 pairs, ≈${credits("Alpha", "Alpha")} credits`,
    );
    expect(result.stdout).toContain("Not yet on the platform (would be pushed): ~1 pair (preview)");
    expect(await remote(project)).toEqual({ en: { a: "Alpha" } });
    expect(await ws.readJson(file("de"))).toEqual({ b: "Beta de" });
    expect(await readOrNull(ws, file("fr"))).toBeNull();
    expect(await mtCreditsUsed(project)).toBe(0);
  });

  it("repo first: --force-mode override sends a changed human value and leaves the file as it is", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { a: "Hello" });
    await ws.write(file("de"), { a: "Hallo" });
    await ws.write(file("fr"), { a: "Bonjour" });
    const push = await runCli(["push", "--force-mode", "override"], {
      cwd: ws.dir,
      apiKey: mtKey,
    });
    expect(push.code, push.stdout + push.stderr).toBe(0);

    await ws.write(file("de"), { a: "Servus" });
    const before = await ws.read(file("de"));
    const result = await translate(ws, mtKey, ["--force-mode", "override"]);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect((await remote(project)).de).toEqual({ a: "Servus" });
    expect(await ws.read(file("de"))).toBe(before);
    expect(await mtCreditsUsed(project)).toBe(0);
  });

  it("does not re-translate a value whose source changed", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { a: "Hello" });
    await ws.write(file("de"), { a: "Hallo" });
    await ws.write(file("fr"), { a: "Bonjour" });
    const push = await runCli(["push", "--force-mode", "override"], {
      cwd: ws.dir,
      apiKey: mtKey,
    });
    expect(push.code, push.stdout + push.stderr).toBe(0);

    await ws.write(file("en"), { a: "Hello there" });
    const before = await ws.read(file("de"));
    const result = await translate(ws, mtKey, ["--force-mode", "override"]);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(await remote(project)).toEqual({
      en: { a: "Hello there" },
      de: { a: "Hallo" },
      fr: { a: "Bonjour" },
    });
    expect(await ws.read(file("de"))).toBe(before);
    expect(await mtCreditsUsed(project)).toBe(0);
  });

  it("--format json prints one parseable report with the documented fields", async () => {
    const { mtKey, ws } = await setup();
    await ws.write(file("en"), { a: "Alpha" });
    await ws.write(file("de"), { a: "Alpha de" });

    const result = await translate(ws, mtKey, ["--force-mode", "override", "--format", "json"]);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toEqual({
      version: 1,
      pairs: {
        toTranslate: 1,
        alreadyInFlight: 0,
        alreadyTranslated: 1,
        noSource: 0,
        translated: 1,
        filledMeanwhile: 0,
        failed: 0,
        unfinished: 0,
        unverifiable: 0,
        notOnPlatform: 0,
      },
      jobs: [
        {
          jobId: expect.any(String),
          targetLocaleCode: "fr",
          keyCount: 1,
          owned: true,
          status: "completed",
          processed: 1,
          failed: 0,
        },
      ],
      written: { files: 1, values: 1, differ: 0 },
      errors: [],
      skippedLocales: [],
      ok: true,
    });
    expect(await ws.readJson(file("fr"))).toEqual({ a: "[fr] Alpha" });
  });

  it("exits 4 before any push when the platform has no mt/fill route", async () => {
    const { project, mtKey, ws } = await setup();
    await ws.write(file("en"), { a: "Alpha" });
    // An older platform: Fastify's own 404 for an unknown route.
    const proxy = await startProxy(undefined, (req) =>
      req.method === "POST" && req.url?.endsWith("/mt/fill")
        ? {
            status: 404,
            body: {
              message: `Route POST:${req.url} not found`,
              error: "Not Found",
              statusCode: 404,
            },
          }
        : undefined,
    );
    cleanups.push(() => proxy.close());

    const result = await translate(ws, mtKey, ["--force-mode", "override"], {
      env: { COMVI_API_BASE_URL: proxy.url },
    });

    expect(result.code, result.stdout + result.stderr).toBe(4);
    expect(result.stderr).toContain("does not support comvi translate");
    expect(result.stdout).not.toContain("Pushing translations");
    expect(await remote(project)).toEqual({});
    expect(await readOrNull(ws, file("de"))).toBeNull();
  });
});
