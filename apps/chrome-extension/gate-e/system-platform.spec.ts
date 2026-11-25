import { expect, test, chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  activateEditor,
  activeTabId,
  EDITOR_URL,
  extensionWorker,
  mockEditorCdn,
  openPopup,
  requireEnv,
  reservePort,
  storedSession,
  waitForDetection,
} from "./helpers";
import type { CredentialStore } from "./helpers";
import {
  closeDialog,
  dialog,
  field,
  framesIn,
  openEditor,
  save,
  typeInto,
  visibleText,
} from "./site";
import { api } from "@comvi/core/cdn";
import { EXPECTED_CONTENT_SCRIPTS } from "../src/shared/__fixtures__/manifest-content-scripts";

/**
 * The 0.8 system test: the real @comvi/core (`createI18n` + `cdn()` + `devtools()`) on a page,
 * the real MV3 extension, the real @comvi/editor (loaded by the page's core on Enable, as the
 * extension loads it: protocol 2, the exact version), against a LOCAL platform — its API, its
 * database, its CDN worker publishing to an S3-compatible store — started by the platform's
 * tests/system/run.ts. The test drives the editor's UI: enable → select a translation → change
 * it → save → see it, then checks what the platform wrote and what Content Deploy published.
 *
 * `VITE_COMVI_API_BASE_URL` is the runner's audit proxy in front of the API. Its `/__system/*`
 * routes are the runner's (never the extension's): the request audit, the database's view of
 * a key, and the Content Deploy log (uploads, purges, deploy results, CDN reads).
 *
 * COM-175 with the Content Deploy filter `translated` is asserted: a same-text demotion and a
 * changed draft keep the published text until approval, then the new text is published.
 * Observations the plan asks for (pt-br, the next server snapshot after a save, COM-175,
 * Content Deploy) are recorded to `COMVI_SYSTEM_OBSERVATIONS_PATH` as they are, with timings
 * on this test's own clock; what is a correctness claim is asserted.
 */

const extensionPath = resolve(import.meta.dirname, "../dist-system");
const apiBaseUrl = requireEnv("VITE_COMVI_API_BASE_URL");
const apiKey = requireEnv("COMVI_SYSTEM_API_KEY");
const cdnBase = requireEnv("COMVI_SYSTEM_CDN_URL");
const publishedValue = requireEnv("COMVI_SYSTEM_CDN_EXPECTED_VALUE");
const headline = JSON.parse(requireEnv("COMVI_SYSTEM_HEADLINE")) as Record<string, string>;
const observationsPath =
  process.env.COMVI_SYSTEM_OBSERVATIONS_PATH ??
  resolve(import.meta.dirname, "../test-results/system-observations.json");
const apiOrigin = new URL(apiBaseUrl).origin;
const ORIGIN = "http://127.0.0.1:8791";
const POLL = { timeout: 15_000 };
const manifest = JSON.parse(
  readFileSync(resolve(extensionPath, "manifest.json"), "utf8"),
) as chrome.runtime.ManifestV3;

type ProxyResult = { denied: boolean; status?: number; networkError?: string; body?: string };
type AuditEntry = {
  method: string;
  path: string;
  hasAuthorization: boolean;
  aborted: boolean;
  body?: string;
};
type StoredValue = { locale: string; value: string; status: string };
type DeployLog = {
  lastDeployResult: { status?: string; timestamp?: string } | null;
  purges: Array<{ at: number; files: string[] }>;
  puts: Array<{ at: number; key: string }>;
  gets: Array<{ at: number; key: string; status: number; servedKey?: string }>;
};

const observations: Record<string, unknown> = { startedAt: new Date().toISOString() };
const startedAt = Date.now();
const clock = () => Date.now() - startedAt;

const control = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}/__system/${path}`, init);
  if (!response.ok)
    throw new Error(`/__system/${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
};
const audit = () => control<{ requests: AuditEntry[] }>("audit").then((r) => r.requests);
const storedKey = (ns: string, key: string) =>
  control<{ values: StoredValue[] }>(
    `key?ns=${encodeURIComponent(ns)}&key=${encodeURIComponent(key)}`,
  ).then((r) => r.values);
const deployLog = () => control<DeployLog>("deploys");
/** What Content Deploy serves now for one file, read from Node: no browser cache in between. */
const cdnFile = async (path: string) => {
  const response = await fetch(`${cdnBase}/${path}`);
  return {
    status: response.status,
    body: response.ok ? ((await response.json()) as Record<string, unknown>) : null,
  };
};

/**
 * Wait, on this test's clock, for a Content Deploy newer than `before` (the platform debounces
 * one after a write: 5 s, at most 60 s). No manual deploy is triggered.
 */
async function waitForDeploy(before: DeployLog, timeoutMs = 90_000) {
  const deadline = clock() + timeoutMs;
  let after = before;
  while (clock() < deadline) {
    after = await deployLog();
    const stamp = after.lastDeployResult?.timestamp;
    if (stamp && stamp !== before.lastDeployResult?.timestamp) return { after, deployed: true };
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  return { after, deployed: false };
}

/**
 * Wait for a Content Deploy that started after `writeAt` (epoch ms), so its files were built
 * from the database as the writes left it. `timestamp` is when a deploy finished, `duration`
 * how long it ran. No manual deploy is triggered.
 */
async function waitForDeployAfter(writeAt: number, timeoutMs = 90_000) {
  const deadline = clock() + timeoutMs;
  while (clock() < deadline) {
    const result = (await deployLog()).lastDeployResult as {
      timestamp?: string;
      duration?: number;
    } | null;
    const finished = result?.timestamp ? Date.parse(result.timestamp) : Number.NaN;
    if (finished - (result?.duration ?? 0) > writeAt) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  throw new Error(`no Content Deploy started after ${new Date(writeAt).toISOString()}`);
}

/** What a new visitor sees: a page with an empty HTTP cache, loaded through cdn(). */
async function visitorSees(browser: Browser, locale: string) {
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    await fresh.goto(`${ORIGIN}${systemPath(locale)}`);
    await expect(fresh.locator("body")).toHaveAttribute("data-booted", "true", POLL);
    return await visibleText(fresh, "#system-headline");
  } finally {
    await context.close();
  }
}

/** Hand the page the next server snapshot of `system.headline` and read what it shows. */
async function readSnapshot(on: Page) {
  const getsBefore = (await deployLog()).gets.length;
  const value = await on.evaluate(() => (globalThis as any).systemPage.snapshot("system.headline"));
  const gets = (await deployLog()).gets.slice(getsBefore);
  return {
    snapshot: value,
    visible: await visibleText(on, "#system-headline"),
    reachedCdn: gets.length > 0,
  };
}

async function proxy(page: Page, path: string, options: { method?: string; body?: string } = {}) {
  return page.evaluate(
    ({ requestPath, requestOptions }) =>
      (globalThis as any).systemPage.proxy(requestPath, requestOptions),
    { requestPath: path, requestOptions: options },
  ) as Promise<ProxyResult>;
}

function parseBody(result: ProxyResult): any {
  expect(result.denied, result.networkError).toBe(false);
  expect(typeof result.body).toBe("string");
  return JSON.parse(result.body!);
}

const systemPath = (locale: string) =>
  `/system?cdn=${encodeURIComponent(cdnBase)}&locale=${encodeURIComponent(locale)}`;

test("0.8: the editor edits real platform data on a cdn() page through the MV3 boundary", async () => {
  test.setTimeout(240_000);
  await test.step("the built manifest grants only the two API origins", async () => {
    expect(manifest.content_scripts).toEqual(EXPECTED_CONTENT_SCRIPTS);
    expect(manifest.host_permissions?.toSorted()).toEqual([`${ORIGIN}/*`, `${apiOrigin}/*`].sort());
    expect(manifest.host_permissions).not.toContain("<all_urls>");
  });

  const userDataDir = await mkdtemp(join(tmpdir(), "comvi-system-platform-"));
  const debuggingPort = await reservePort();
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [
      `--remote-debugging-port=${debuggingPort}`,
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const connections: Browser[] = [];
  // A second, plain browser for the HTTP-cache reading: Playwright turns the HTTP cache off in
  // a context with request routing (the editor CDN stand-in above), so the extension's context
  // cannot show what `max-age=30` does to the next snapshot.
  const plainBrowser = await chromium.launch({ channel: "chromium", headless: true });

  try {
    // The real @comvi/editor build of this commit, answered for the exact jsDelivr URL the
    // page's core requests on Enable.
    const editorCdn = await mockEditorCdn(context);
    const worker = await extensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    const startupPages = context.pages();
    const page = await context.newPage();
    await Promise.all(startupPages.map((startupPage) => startupPage.close()));
    await page.goto(`${ORIGIN}${systemPath("en")}`);
    await expect(page.locator("body")).toHaveAttribute("data-booted", "true", POLL);
    await page.bringToFront();
    const tabId = await activeTabId(worker);
    await waitForDetection(worker, tabId);

    await test.step("the page reads what Content Deploy published, with cdn()", async () => {
      expect(await visibleText(page, "#system-published")).toBe(publishedValue);
      expect(await visibleText(page, "#system-headline")).toBe(headline.en);
      const loads = await page.evaluate(() => (globalThis as any).systemPage.loads);
      expect(loads).toEqual([expect.objectContaining({ locale: "en", ns: "common", ok: true })]);
    });

    // A visitor's page, open before the edit: its catalog is in its HTTP cache from now.
    const visitor = await (await plainBrowser.newContext()).newPage();
    await visitor.goto(`${ORIGIN}${systemPath("en")}`);
    await expect(visitor.locator("body")).toHaveAttribute("data-booted", "true", POLL);
    const visitorLoadedAt = clock();

    const popup = await openPopup(worker, extensionId, debuggingPort, connections);
    await activateEditor(popup, page, worker, tabId, apiKey);
    await popup.close();
    await page.bringToFront();

    await test.step("Enable loaded the exact editor version, once", async () => {
      expect(editorCdn.requests).toEqual([EDITOR_URL]);
    });

    let localeNames: Record<string, string> = {};
    await test.step("editor routes round-trip through the proxy to the real API", async () => {
      const project = parseBody(await proxy(page, "/v1/project"));
      expect(project.id).toBe(1);
      const locales = parseBody(await proxy(page, "/v1/project/locales")) as {
        locales: Array<{ code: string; name: string }>;
      };
      localeNames = Object.fromEntries(locales.locales.map(({ code, name }) => [code, name]));
      expect(Object.keys(localeNames).toSorted()).toEqual(["en", "es", "pt-BR"]);
      expect(parseBody(await proxy(page, "/v1/translations"))).toBeTruthy();

      const saved = await proxy(page, "/v1/keys", {
        method: "PUT",
        body: JSON.stringify({
          key: "system.crud",
          namespace: "common",
          isPlural: false,
          translations: { en: { value: "System value", status: "translated" } },
        }),
      });
      expect([200, 201]).toContain(saved.status);
      const read = parseBody(await proxy(page, "/v1/keys/common/system.crud"));
      expect(read.translations.en.value).toBe("System value");
    });

    await test.step("api() of @comvi/core loads pt-br, which the platform keys pt-BR", async () => {
      // From Node with the project key: the documented server/script use of api(). The text
      // is the pt-BR one, so the catalog of a parent or fallback locale cannot pass for it.
      const catalog = await api(apiBaseUrl, { key: apiKey })(
        "pt-br",
        "common",
        AbortSignal.timeout(20_000),
      );
      expect(headline["pt-BR"]).not.toBe(headline.en);
      expect(catalog["system.headline"]).toBe(headline["pt-BR"]);
      observations.ptBrApiLoader = { ok: true, headline: catalog["system.headline"] ?? null };
    });

    await test.step("observation: the API's answer to the app's spelling pt-br", async () => {
      const result = await proxy(page, "/v1/translations?locales=pt-br&namespaces=common");
      const body = result.body ? JSON.parse(result.body) : null;
      observations.ptBrApi = {
        request: "GET /v1/translations?locales=pt-br&namespaces=common",
        status: result.status,
        denied: result.denied,
        locales: body?.locales,
        namespaceLocales: body?.namespaces?.common ? Object.keys(body.namespaces.common) : null,
        headline:
          body?.namespaces?.common?.["pt-br"]?.["system.headline"] ??
          body?.namespaces?.common?.["pt-BR"]?.["system.headline"] ??
          null,
      };
    });

    // Context collection is OFF (owner decision D4): no session opens the context routes.
    await test.step("the context routes stay closed for the whole session", async () => {
      for (const [path, body] of [
        ["/v1/context/handshake", { keys: [] }],
        ["/v1/context/usages", { origin: ORIGIN, hashFnVersion: 1, items: [], stillValid: [] }],
      ] as const) {
        const refused = await proxy(page, path, { method: "POST", body: JSON.stringify(body) });
        expect(refused.denied).toBe(true);
      }
    });

    const edited = `Edited in the editor ${Date.now()}`;
    let savedAt = 0;
    let deployBeforeSave: DeployLog | undefined;
    // Epoch ms after the last write the next deploy must reflect (see waitForDeployAfter).
    let lastWriteAt = 0;
    await test.step("enable → select → change → save → see, in the editor's UI", async () => {
      await expect
        .poll(() => framesIn(page, "#system-headline"), POLL)
        .toEqual([{ inst: "", ns: "common", key: "system.headline", close: false }]);
      await openEditor(page, "#system-headline");
      await expect(dialog(page)).toContainText("system.headline");
      await expect(field(page, localeNames.en!)).toHaveValue(headline.en!, POLL);
      await expect(field(page, localeNames.es!)).toHaveValue(headline.es!, POLL);
      deployBeforeSave = await deployLog();
      await typeInto(page, localeNames.en!, edited);
      expect(await save(page)).toContain("Saved");
      savedAt = clock();
      lastWriteAt = Date.now();
      await expect.poll(() => visibleText(page, "#system-headline"), POLL).toBe(edited);
      await closeDialog(page);
    });

    await test.step("the platform stored the edit under the session's API key", async () => {
      const puts = (await audit()).filter(
        ({ method, path, body }) =>
          method === "PUT" && path === "/v1/keys" && body?.includes('"system.headline"'),
      );
      expect(puts).toHaveLength(1);
      expect(puts[0]!.hasAuthorization).toBe(true);
      const sent = JSON.parse(puts[0]!.body!) as {
        key: string;
        namespace: string;
        translations: Record<string, { value: string; status: string }>;
      };
      expect(sent.key).toBe("system.headline");
      expect(sent.namespace).toBe("common");
      expect(sent.translations.en?.value).toBe(edited);

      const stored = await storedKey("common", "system.headline");
      const byLocale = Object.fromEntries(stored.map((row) => [row.locale, row]));
      expect(byLocale.en?.value).toBe(edited);

      // COM-175 (found on 0.6): the save sent every locale of the key and set each one to
      // not_reviewed, the unchanged source locale included. Recorded as is, then asserted:
      // an unchanged locale is neither sent nor altered.
      observations.com175 = {
        savePayload: sent,
        localesSent: Object.keys(sent.translations).toSorted(),
        storedAfterSave: stored,
      };
      expect.soft(Object.keys(sent.translations), "only the edited locale is sent").toEqual(["en"]);
      for (const locale of ["es", "pt-BR"]) {
        expect.soft(byLocale[locale], `unchanged ${locale} keeps value and status`).toEqual({
          locale,
          value: headline[locale],
          status: "translated",
        });
      }
    });

    await test.step("COM-175: a save that sends every locale of the key demotes the unchanged ones", async () => {
      // The 0.8 editor sends only the edited locale (asserted above). The 0.6 editor sent every
      // locale of the key, each with status not_reviewed; this write is that save, through the
      // editor's route, session and MV3 proxy (which accepts only this payload shape). es and
      // pt-BR go translated -> not_reviewed with unchanged text: the same-text demotion.
      const resave = await proxy(page, "/v1/keys", {
        method: "PUT",
        body: JSON.stringify({
          key: "system.headline",
          namespace: "common",
          isPlural: false,
          translations: {
            en: { value: edited, status: "not_reviewed" },
            es: { value: headline.es, status: "not_reviewed" },
            "pt-BR": { value: headline["pt-BR"], status: "not_reviewed" },
          },
        }),
      });
      expect([200, 201]).toContain(resave.status);
      lastWriteAt = Date.now();
      const stored = await storedKey("common", "system.headline");
      expect(stored.toSorted((a, b) => a.locale.localeCompare(b.locale))).toEqual([
        { locale: "en", value: edited, status: "not_reviewed" },
        { locale: "es", value: headline.es, status: "not_reviewed" },
        { locale: "pt-BR", value: headline["pt-BR"], status: "not_reviewed" },
      ]);
    });

    await test.step("observation: Content Deploy after the save, and the next server snapshot", async () => {
      const before = deployBeforeSave!;
      const firstSnapshot = {
        tSinceSaveMs: clock() - savedAt,
        snapshot: await page.evaluate(() =>
          (globalThis as any).systemPage.snapshot("system.headline"),
        ),
        visible: await visibleText(page, "#system-headline"),
      };
      await waitForDeployAfter(lastWriteAt);
      const after = await deployLog();
      const deployedAt = clock();
      const servedEn = await cdnFile("common/en.json");
      const servedEs = await cdnFile("common/es.json");

      // Controlled snapshots after the deploy, every 5 s for 45 s: what the page shows when a
      // server snapshot arrives through the browser's HTTP cache (max-age=30).
      const snapshots: Array<Record<string, unknown>> = [];
      for (let i = 0; i <= 9; i += 1) {
        snapshots.push({
          tSinceSaveMs: clock() - savedAt,
          tSinceDeployMs: clock() - deployedAt,
          tSinceVisitorLoadMs: clock() - visitorLoadedAt,
          editorPage: await readSnapshot(page),
          visitorPage: await readSnapshot(visitor),
        });
        if (i < 9) await page.waitForTimeout(5_000);
      }
      observations.contentDeploy = {
        deployBeforeSave: before.lastDeployResult,
        deployAfterSave: after.lastDeployResult,
        automaticDeploy: true,
        deployObservedSinceSaveMs: deployedAt - savedAt,
        purgesBeforeSave: before.purges,
        purgesSinceSave: after.purges.slice(before.purges.length),
        uploadsSinceSave: after.puts.slice(before.puts.length).map(({ key }) => key),
        servedEnHeadline: servedEn.body?.["system.headline"] ?? null,
        servedEnStatus: servedEn.status,
        servedEsHeadline: servedEs.body?.["system.headline"] ?? null,
      };
      observations.snapshotAfterSave = {
        note: "editorPage: Playwright routing disables its HTTP cache; visitorPage: plain browser, HTTP cache on",
        firstSnapshot,
        snapshots,
      };
    });

    // COM-175 with the filter `translated`, on the deploy after both writes above. Soft, so a
    // red run shows each criterion; any failure fails the test.
    await test.step("COM-175: the visitor keeps the published text while drafts wait for review", async () => {
      // 1. Same text, demoted translated -> not_reviewed by the every-locale save above (the
      //    0.6 editor's save shape).
      for (const locale of ["es", "pt-BR"] as const) {
        expect
          .soft((await cdnFile(`common/${locale}.json`)).body?.["system.headline"] ?? null, {
            message: `published ${locale} file keeps the demoted, unchanged text`,
          })
          .toBe(headline[locale]);
      }
      expect
        .soft(await visitorSees(plainBrowser, "es"), "a new es visitor sees the demoted text")
        .toBe(headline.es);
      // 2. A changed draft: the visitor keeps the previous published text, the draft stays
      //    not_reviewed.
      expect
        .soft(
          (await cdnFile("common/en.json")).body?.["system.headline"] ?? null,
          "published en file keeps the previous approved text",
        )
        .toBe(headline.en);
      expect
        .soft(await visitorSees(plainBrowser, "en"), "a new en visitor sees the previous text")
        .toBe(headline.en);
      const en = (await storedKey("common", "system.headline")).find((v) => v.locale === "en");
      expect(en).toEqual({ locale: "en", value: edited, status: "not_reviewed" });
    });

    await test.step("COM-175: after approval and the next deploy the visitor sees the new text", async () => {
      // 3. Approval through the editor's route and session: the same text, status translated.
      const approved = await proxy(page, "/v1/keys", {
        method: "PUT",
        body: JSON.stringify({
          key: "system.headline",
          namespace: "common",
          isPlural: false,
          translations: { en: { value: edited, status: "translated" } },
        }),
      });
      expect([200, 201]).toContain(approved.status);
      lastWriteAt = Date.now();
      const en = (await storedKey("common", "system.headline")).find((v) => v.locale === "en");
      expect(en).toEqual({ locale: "en", value: edited, status: "translated" });
      await waitForDeployAfter(lastWriteAt);
      expect((await cdnFile("common/en.json")).body?.["system.headline"] ?? null).toBe(edited);
      expect(await visitorSees(plainBrowser, "en")).toBe(edited);
      // es was not approved: it still publishes its demoted, unchanged text.
      expect((await cdnFile("common/es.json")).body?.["system.headline"] ?? null).toBe(headline.es);
    });

    await test.step("observation: the same save with no Content Deploy status filter", async () => {
      // Every status published (the platform's default, `[]`): what a save looks like when the
      // filter COM-175 is about does not apply.
      await control("content-deploy-statuses", { method: "POST", body: JSON.stringify([]) });
      await visitor.reload();
      await expect(visitor.locator("body")).toHaveAttribute("data-booted", "true", POLL);
      const visitorReloadedAt = clock();
      const before = await deployLog();
      const again = `Edited again ${Date.now()}`;
      await openEditor(page, "#system-headline");
      await typeInto(page, localeNames.en!, again);
      const toast = await save(page);
      const againAt = clock();
      const shown = await expect
        .poll(() => visibleText(page, "#system-headline"), { timeout: 5_000 })
        .toBe(again)
        .then(
          () => true,
          () => false,
        );
      await closeDialog(page);
      const { after, deployed } = await waitForDeploy(before);
      const deployedAt = clock();
      const snapshots: Array<Record<string, unknown>> = [];
      // Every 5 s until the visitor's cached catalog is 35 s old.
      while (deployed) {
        snapshots.push({
          tSinceSaveMs: clock() - againAt,
          tSinceDeployMs: clock() - deployedAt,
          tSinceVisitorLoadMs: clock() - visitorReloadedAt,
          editorPage: await readSnapshot(page),
          visitorPage: await readSnapshot(visitor),
        });
        if (clock() - visitorReloadedAt > 35_000) break;
        await page.waitForTimeout(5_000);
      }
      observations.noStatusFilter = {
        edited: again,
        toast,
        shownAfterSave: shown,
        deployed,
        deployObservedSinceSaveMs: deployedAt - againAt,
        purgesSinceSave: after.purges.slice(before.purges.length),
        servedEnHeadline: (await cdnFile("common/en.json")).body?.["system.headline"] ?? null,
        storedAfterSave: await storedKey("common", "system.headline"),
        snapshots,
      };
      // With no status filter the draft itself is published: the COM-175 fallback is not used.
      expect(deployed, "a deploy followed the save").toBe(true);
      const stored = await storedKey("common", "system.headline");
      expect(stored.find((v) => v.locale === "en")).toEqual({
        locale: "en",
        value: again,
        status: "not_reviewed",
      });
      expect((await cdnFile("common/en.json")).body?.["system.headline"] ?? null).toBe(again);
    });

    await test.step("no destructive route ran and the key never reached the page", async () => {
      const deleted = await proxy(page, "/v1/keys/common/system.crud", { method: "DELETE" });
      expect([200, 204]).toContain(deleted.status);
      const missing = await proxy(page, "/v1/keys/common/system.crud");
      expect(missing.denied).toBe(true);
      expect((await proxy(page, "/v1/organizations")).denied).toBe(true);
      expect(
        await page.evaluate(
          (secret) => document.documentElement.innerHTML.includes(secret),
          apiKey,
        ),
      ).toBe(false);
      expect(
        await page.evaluate(() =>
          (globalThis as any).__PAGE_EGRESS__.some((request: any) => request.hasAuth),
        ),
      ).toBe(false);
    });

    await test.step("reload revokes the session; the page shows what Content Deploy serves", async () => {
      await page.reload();
      await expect(page.locator("body")).toHaveAttribute("data-booted", "true", POLL);
      await expect.poll(() => storedSession(worker, tabId), POLL).toBeUndefined();
      expect(await proxy(page, "/v1/project")).toMatchObject({ denied: true });
      observations.afterReload = {
        tSinceSaveMs: clock() - savedAt,
        visible: await visibleText(page, "#system-headline"),
        loads: await page.evaluate(() => (globalThis as any).systemPage.loads),
      };
    });

    await test.step("observation: an app that spells the locale pt-br", async () => {
      const getsBefore = (await deployLog()).gets.length;
      const ptBr = await context.newPage();
      await ptBr.goto(`${ORIGIN}${systemPath("pt-br")}`);
      await expect(ptBr.locator("body")).toHaveAttribute("data-booted", "true", POLL);
      await ptBr.bringToFront();
      const ptBrTab = await activeTabId(worker);
      await waitForDetection(worker, ptBrTab);
      const record: Record<string, unknown> = {
        loads: await ptBr.evaluate(() => (globalThis as any).systemPage.loads),
        cdnReads: (await deployLog()).gets.slice(getsBefore),
        visibleHeadline: await visibleText(ptBr, "#system-headline"),
        expectedPtBR: headline["pt-BR"],
      };
      observations.ptBrCdn = record;

      // The editor on that page: which field holds the page's text, and does a save show?
      const ptBrPopup = await openPopup(worker, extensionId, debuggingPort, connections);
      await activateEditor(ptBrPopup, ptBr, worker, ptBrTab, apiKey);
      await ptBrPopup.close();
      await ptBr.bringToFront();
      await openEditor(ptBr, "#system-headline");
      const portuguese = field(ptBr, localeNames["pt-BR"]!);
      await expect(portuguese).toBeVisible(POLL);
      record.editorFieldValue = await portuguese.inputValue();
      const ptEdited = `Editado ${Date.now()}`;
      await typeInto(ptBr, localeNames["pt-BR"]!, ptEdited);
      record.saveToast = await save(ptBr);
      const puts = (await audit()).filter(
        ({ method, path, body }) =>
          method === "PUT" && path === "/v1/keys" && body?.includes(ptEdited),
      );
      record.savePayload = puts.map(({ body }) => JSON.parse(body!));
      // Observed on the test's clock: 5 s for the page to show the save, then recorded as is.
      record.shownAfterSave = await expect
        .poll(() => visibleText(ptBr, "#system-headline"), { timeout: 5_000 })
        .toBe(ptEdited)
        .then(
          () => true,
          () => false,
        );
      record.visibleAfterSave = await visibleText(ptBr, "#system-headline");
      record.storedAfterSave = await storedKey("common", "system.headline");
      await closeDialog(ptBr);
      await ptBr.close();
      await page.bringToFront();
    });

    await test.step("Forget key removes the credential", async () => {
      const forgetPopup = await openPopup(worker, extensionId, debuggingPort, connections);
      await expect(forgetPopup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
      await expect(forgetPopup.locator("#api-key")).toHaveValue(apiKey);
      await forgetPopup.locator("#forget-key-btn").click();
      await expect
        .poll(() =>
          worker.evaluate(() => {
            const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
            return chromeApi.storage.local
              .get<CredentialStore>("comvi_credentials")
              .then((state) => state.comvi_credentials?.["http://127.0.0.1:8791"]);
          }),
        )
        .toBeUndefined();
      await forgetPopup.close();
    });
    expect(await proxy(page, "/v1/project")).toMatchObject({ denied: true });
  } finally {
    observations.finishedAt = new Date().toISOString();
    mkdirSync(dirname(observationsPath), { recursive: true });
    writeFileSync(observationsPath, `${JSON.stringify(observations, null, 2)}\n`);
    await context.close();
    await plainBrowser.close();
  }
});
