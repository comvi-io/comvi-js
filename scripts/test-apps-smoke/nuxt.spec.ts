import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";

/**
 * Lot 7 scenarios (owner brief 2026-11-11 §5) on a production build of `test-apps/nuxt4`
 * (Nuxt 4) and `test-apps/nuxt` (Nuxt 3), run by `run.mjs` after its HTTP checks. The app
 * reads its catalogs through its own route (`server/api/i18n/[locale]/[ns].get.ts`, the
 * private source: a secret and an access rule on the server), which reads them from the
 * mock of `catalog-mock.mjs`; the tests steer the mock per (locale, namespace) pair: a
 * held request, a failed one, an empty one. A browser load is a request of the page to
 * `/api/i18n/…`, counted here; a server render's load is in-process and never reaches the
 * browser. Every wait is on a concrete state (a held request, a text, the hydration
 * marker), never on time. Every test fails on its own on a `console.error`, a console
 * warning, an uncaught error or an unhandled rejection.
 */

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — run this through \`pnpm test-apps:smoke\`.`);
  return value;
};
const MOCK = env("E2E_MOCK_URL");
const APP_DIR = env("E2E_APP_DIR");
const LOCALES = env("E2E_LOCALES_DIR");
const BASE = env("E2E_BASE_URL");

type Entry = { pair: string; from: "server" | "browser"; status: number };
const mock = {
  mode: (m: { hold?: string[]; fail?: string[]; empty?: string[] }) =>
    fetch(`${MOCK}/__mode`, { method: "POST", body: JSON.stringify(m) }),
  release: (pair: string) =>
    fetch(`${MOCK}/__release`, { method: "POST", body: JSON.stringify({ pair }) }),
  reset: () => fetch(`${MOCK}/__reset`, { method: "POST" }),
  log: async (): Promise<Entry[]> => (await fetch(`${MOCK}/__log`)).json(),
  held: async (): Promise<string[]> => (await fetch(`${MOCK}/__held`)).json(),
};
const catalog = (locale: string, ns = "default"): Record<string, any> =>
  JSON.parse(
    fs.readFileSync(
      path.join(LOCALES, ns === "default" ? `${locale}.json` : `${ns}/${locale}.json`),
      "utf8",
    ),
  );

const test = base.extend<{ errors: string[]; asked: string[] }>({
  // Browser time zone UTC; the server formats in Pacific/Kiritimati (UTC+14). Signed in:
  // the `account` namespace is for a session only.
  context: async ({ browser }, use) => {
    const context = await browser.newContext({ timezoneId: "UTC", locale: "en-US" });
    await context.addCookies([{ name: "session", value: "ok", url: BASE }]);
    await use(context);
    await context.close();
  },
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        // A failed catalog request is the scenario itself (the browser logs every non-2xx
        // response); its report is the app's `onError`.
        if (
          /^Failed to load resource: the server responded with a status of (500|401)/.test(m.text())
        )
          return;
        if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.addInitScript(() =>
        addEventListener("unhandledrejection", (e) =>
          console.error(`unhandled rejection: ${String(e.reason)}`),
        ),
      );
      await mock.reset();
      await use(errors);
      expect(errors, "console errors and warnings, uncaught errors").toEqual([]);
    },
    { auto: true },
  ],
  // Every catalog the BROWSER asked for (`locale/ns`), in order.
  asked: [
    async ({ page }, use) => {
      const asked: string[] = [];
      page.on("request", (r) => {
        const m = /\/api\/i18n\/(.+)$/.exec(new URL(r.url()).pathname);
        if (m) asked.push(m[1]!);
      });
      await use(asked);
    },
    { auto: true },
  ],
});

const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1);
const id = (page: Page, testId: string) => page.getByTestId(testId);
/** The markup of `html` without scripts: what is on screen before JavaScript runs. */
const markup = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const testText = (html: string, testId: string) =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)`).exec(markup(html))?.[1]?.trim();
const testAttr = (html: string, testId: string, attr: string) =>
  new RegExp(
    `<[^>]*${attr}="([^"]*)"[^>]*data-testid="${testId}"|data-testid="${testId}"[^>]*${attr}="([^"]*)"`,
  )
    .exec(markup(html))
    ?.slice(1)
    .find(Boolean);
const htmlAttr = (html: string, attr: string) =>
  new RegExp(`\\s${attr}="([^"]*)"`).exec(/<html\b[^>]*>/i.exec(html)![0])?.[1];
const get = async (request: APIRequestContext, url: string, headers: Record<string, string> = {}) =>
  request.get(url, { headers: { "accept-language": "en", ...headers }, maxRedirects: 0 });
const cookieOf = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === "i18n_locale")?.value;
/** Every text `testId` shows from now on, in order (a MutationObserver). */
const watchTexts = (page: Page, testId: string) =>
  page.evaluate((tid) => {
    const seen: string[] = ((window as unknown as { __seen: string[] }).__seen = []);
    const read = () => {
      const t = document.querySelector(`[data-testid="${tid}"]`)?.textContent?.trim() ?? "<none>";
      if (t !== seen[seen.length - 1]) seen.push(t);
    };
    read();
    new MutationObserver(read).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }, testId);
const seenTexts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);

const EN = catalog("en");
const UK = catalog("uk");
const EN_ADMIN = catalog("en", "admin");
const UK_ADMIN = catalog("uk", "admin");
const DE_ADMIN = catalog("de", "admin");
const EN_ACCOUNT = catalog("en", "account");

test("1: the recipe on the first render: text, $t, param, plural, nested rich text, formatting; hydration keeps it and asks for nothing", async ({
  page,
  request,
  asked,
}) => {
  const html = await (await get(request, "/uk")).text();
  expect(htmlAttr(html, "lang")).toBe("uk-UA");
  expect(htmlAttr(html, "dir")).toBe("ltr");
  expect(testText(html, "title")).toBe(UK["home.title"]);
  expect(testText(html, "dollar-t")).toBe(UK["home.subtitle"]);
  expect(testText(html, "param")).toBe(UK["home.intro"].replace("{name}", "Ada"));
  expect(testText(html, "plural")).toMatch(/^2 /);
  expect(testText(html, "number")).toMatch(/^1\s234,5$/);
  // 2026-01-01 23:30 UTC in Pacific/Kiritimati (the configured zone) is 2 January, 13:30.
  expect(testText(html, "date")).toMatch(/13:30/);
  // Nested rich text: <link><bold>…</bold></link> → <a><b>…</b></a>.
  expect(markup(html)).toMatch(
    /data-testid="rich">(?:<!--\[-->)?[^<]*<a href="https:\/\/comvi.io\/docs"><b>[^<]+<\/b><\/a>/,
  );
  await page.goto("/uk");
  await hydrated(page);
  for (const tid of ["title", "dollar-t", "param", "plural", "number", "date"])
    await expect(id(page, tid)).toHaveText(testText(html, tid)!);
  await expect(id(page, "rich").locator("a > b")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  expect(asked).toEqual([]);
});

test("2: the snapshot is a fallback chain: a server null with and without a fallback, a regional locale, an empty catalog — hydration asks for nothing and shows the server's branch", async ({
  page,
  request,
  asked,
}) => {
  const cases: Array<{
    name: string;
    url: string;
    mode: { fail?: string[]; empty?: string[] };
    title: string;
    ready: string;
  }> = [
    {
      name: "uk:admin ok",
      url: "/uk/admin",
      mode: {},
      title: UK_ADMIN.welcome_admin,
      ready: "true",
    },
    {
      name: "uk:admin null, the fallback en in place",
      url: "/uk/admin",
      mode: { fail: ["uk:admin"] },
      title: EN_ADMIN.welcome_admin,
      ready: "true",
    },
    {
      name: "uk:admin and en:admin null: nothing in the chain",
      url: "/uk/admin",
      mode: { fail: ["uk:admin", "en:admin"] },
      title: "unavailable",
      ready: "false",
    },
    {
      name: "de-AT: no catalog of its own (null), its parent de, then en",
      url: "/de-AT/admin",
      mode: {},
      title: DE_ADMIN.welcome_admin,
      ready: "true",
    },
    {
      name: "uk:admin empty ({}): in place, every key missing → the fallback's text",
      url: "/uk/admin",
      mode: { empty: ["uk:admin"] },
      title: EN_ADMIN.welcome_admin,
      ready: "true",
    },
  ];
  for (const c of cases) {
    await mock.reset();
    await mock.mode(c.mode);
    const html = await (await get(request, c.url)).text();
    expect(testText(html, "admin-title"), c.name).toBe(c.title);
    expect(testAttr(html, "admin", "data-ready"), c.name).toBe(c.ready);
    expect(testAttr(html, "admin", "data-loading"), c.name).toBe("false");
    await page.goto(c.url);
    await hydrated(page);
    await page.waitForLoadState("networkidle");
    await expect(id(page, "admin-title"), c.name).toHaveText(c.title);
    await expect(id(page, "admin"), c.name).toHaveAttribute("data-ready", c.ready);
    await expect(id(page, "admin"), c.name).toHaveAttribute("data-loading", "false");
    expect(asked, `${c.name}: browser loads at hydration`).toEqual([]);
    if (c.url.startsWith("/de-AT"))
      // The regional locale: its own pairs failed on the server (no file: `null`) in both
      // renders (the request above and the page load), its parent's and the fallback's
      // loaded — all handed over, none asked again by the browser.
      expect(
        (await mock.log()).filter((e) => e.pair.startsWith("de-AT:")).map((e) => e.status),
      ).toEqual([404, 404, 404, 404]);
  }
});

for (const first of ["de", "uk"] as const) {
  test(`3: two parallel requests in uk and de, ${first} answered first, each in its own locale`, async ({
    request,
  }) => {
    await mock.mode({ hold: ["uk:admin", "de:admin"] });
    const uk = get(request, "/uk/admin").then((r) => r.text());
    const de = get(request, "/de/admin").then((r) => r.text());
    await expect.poll(async () => (await mock.held()).sort()).toEqual(["de:admin", "uk:admin"]);
    await mock.release(`${first}:admin`);
    await (first === "de" ? de : uk);
    await mock.release(`${first === "de" ? "uk" : "de"}:admin`);
    const [ukHtml, deHtml] = await Promise.all([uk, de]);
    expect(htmlAttr(ukHtml, "lang")).toBe("uk-UA");
    expect(htmlAttr(deHtml, "lang")).toBe("de-DE");
    expect(testText(ukHtml, "admin-title")).toBe(UK_ADMIN.welcome_admin);
    expect(testText(deHtml, "admin-title")).toBe(DE_ADMIN.welcome_admin);
    expect(testText(ukHtml, "nav-locale")).toBe("uk");
    expect(testText(deHtml, "nav-locale")).toBe("de");
    // Each payload carries its own locale only.
    expect(ukHtml).not.toContain(DE_ADMIN.welcome_admin);
    expect(deHtml).not.toContain(UK_ADMIN.welcome_admin);
  });
}

test("4: a page namespace the layout does not use, on a client navigation: one browser load; the layout keeps its state", async ({
  page,
  asked,
}) => {
  await page.goto("/");
  await hydrated(page);
  await id(page, "layout-count").click();
  await id(page, "nav-admin").click();
  await expect(id(page, "admin-title")).toHaveText(EN_ADMIN.welcome_admin);
  await expect(id(page, "layout-count")).toHaveText("1");
  expect(asked).toEqual(["en/admin"]);
  // Back home and again: the catalog is in place, nothing is asked.
  await id(page, "nav-home").click();
  await expect(id(page, "title")).toHaveText(EN["home.title"]);
  await id(page, "nav-admin").click();
  await expect(id(page, "admin-title")).toHaveText(EN_ADMIN.welcome_admin);
  expect(asked).toEqual(["en/admin"]);
});

test("5: switching the language is a navigation: URL, text, cookie and <html lang dir> move together; the layout keeps its state", async ({
  page,
  asked,
}) => {
  await page.goto("/admin");
  await hydrated(page);
  await id(page, "layout-count").click();
  await watchTexts(page, "admin-title");
  await id(page, "switch-uk").click();
  await expect(page).toHaveURL(/\/uk\/admin$/);
  await expect(id(page, "admin-title")).toHaveText(UK_ADMIN.welcome_admin);
  await expect(id(page, "nav-locale")).toHaveText("uk");
  await expect(page.locator("html")).toHaveAttribute("lang", "uk-UA");
  await expect(id(page, "layout-count")).toHaveText("1");
  expect(await cookieOf(page)).toBe("uk");
  expect(asked.sort()).toEqual(["uk/admin", "uk/default"]);
  // The old text stayed until the new catalogs were in: no loading branch, no key.
  expect(await seenTexts(page)).toEqual([EN_ADMIN.welcome_admin, UK_ADMIN.welcome_admin]);
  // Arabic: right to left.
  await page.goto("/ar");
  await hydrated(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await id(page, "switch-de").click();
  await expect(page).toHaveURL(/\/de$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "de-DE");
  // Back to the default locale: the unprefixed URL, and the cookie records it.
  await id(page, "switch-en").click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/$`));
  await expect(id(page, "title")).toHaveText(EN["home.title"]);
  expect(await cookieOf(page)).toBe("en");
});

test("6: fast consecutive navigations: the older switch never lands", async ({ page }) => {
  await page.goto("/admin");
  await hydrated(page);
  await watchTexts(page, "admin-title");
  await mock.mode({ hold: ["uk:admin"] });
  await id(page, "switch-uk").click();
  await expect.poll(mock.held).toContain("uk:admin");
  await id(page, "switch-de").click();
  await expect(id(page, "admin-title")).toHaveText(DE_ADMIN.welcome_admin);
  await expect(page).toHaveURL(/\/de\/admin$/);
  await mock.release("uk:admin");
  await expect
    .poll(async () => (await mock.log()).find((e) => e.pair === "uk:admin")?.status)
    .toBe(200);
  await page.waitForLoadState("networkidle");
  await expect(id(page, "admin-title")).toHaveText(DE_ADMIN.welcome_admin);
  await expect(id(page, "nav-locale")).toHaveText("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de-DE");
  await expect(page).toHaveURL(/\/de\/admin$/);
  expect(await cookieOf(page)).toBe("de");
  expect(await seenTexts(page)).not.toContain(UK_ADMIN.welcome_admin);
});

test("7: a load error on a client navigation, nothing in the chain: unavailable, nothing unhandled; a revisit asks nothing; Retry loads", async ({
  page,
  asked,
}) => {
  await page.goto("/uk");
  await hydrated(page);
  await mock.mode({ fail: ["uk:admin", "en:admin"] });
  await id(page, "nav-admin").click();
  await expect(id(page, "admin-title")).toHaveText(/^\s*unavailable/);
  await expect(id(page, "admin")).toHaveAttribute("data-loading", "false");
  expect(asked.sort()).toEqual(["en/admin", "uk/admin"]);
  await id(page, "nav-home").click();
  await expect(id(page, "title")).toHaveText(UK["home.title"]);
  await id(page, "nav-admin").click();
  await expect(id(page, "admin-title")).toHaveText(/^\s*unavailable/);
  expect(asked).toHaveLength(2);
  await mock.mode({});
  await id(page, "retry-load").click();
  await expect(id(page, "admin-title")).toHaveText(UK_ADMIN.welcome_admin);
});

test("8: a switch that fails (no catalog of the target): the locale on screen stays, the URL follows it, the cookie too", async ({
  page,
}) => {
  await page.goto("/admin");
  await hydrated(page);
  await mock.mode({ fail: ["fr:default", "fr:admin"] });
  await id(page, "switch-fr").click();
  await expect.poll(async () => (await mock.log()).some((e) => e.pair === "fr:admin")).toBe(true);
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(new RegExp(`${BASE}/admin$`));
  await expect(id(page, "nav-locale")).toHaveText("en");
  await expect(id(page, "admin-title")).toHaveText(EN_ADMIN.welcome_admin);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  expect(await cookieOf(page)).toBe("en");
});

test("9: a direct setLocale() in a prefix mode changes the text and the cookie, not the URL; the next navigation applies the URL's locale", async ({
  page,
}) => {
  await page.goto("/");
  await hydrated(page);
  await id(page, "direct-uk").click();
  await expect(id(page, "title")).toHaveText(UK["home.title"]);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk-UA");
  expect(page.url()).toBe(`${BASE}/`);
  await expect.poll(() => cookieOf(page)).toBe("uk");
  // `/admin` is the default locale's URL under as-needed.
  await page.goto(`${BASE}/admin`);
  await hydrated(page);
  await expect(id(page, "nav-locale")).toHaveText("en");
});

test("10: the cookie: one writer, one Set-Cookie; detection on the root, a stored preference kept on a path-implied default", async ({
  request,
}) => {
  const setCookies = (r: Awaited<ReturnType<typeof get>>) =>
    r
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith("i18n_locale="))
      .map((h) => h.value.split(";")[0]);
  // The root names no locale: the cookie decides, a redirect follows.
  let r = await get(request, "/", { cookie: "i18n_locale=de" });
  expect(r.status()).toBe(302);
  expect(new URL(r.headers().location!, BASE).pathname).toBe("/de");
  expect(setCookies(r)).toEqual([]);
  // A prefixless non-root path is the default locale's URL; the stored preference stays.
  r = await get(request, "/admin", { cookie: "i18n_locale=de" });
  expect(r.status()).toBe(200);
  expect(testText(await r.text(), "nav-locale")).toBe("en");
  expect(setCookies(r)).toEqual([]);
  // A URL that names a locale records it, once.
  r = await get(request, "/uk/admin", { cookie: "i18n_locale=de" });
  expect(setCookies(r)).toEqual(["i18n_locale=uk"]);
  r = await get(request, "/uk/admin", { cookie: "i18n_locale=uk" });
  expect(setCookies(r)).toEqual([]);
  // Accept-Language on the root, no cookie: the redirect and the record.
  r = await get(request, "/", { "accept-language": "uk" });
  expect(new URL(r.headers().location!, BASE).pathname).toBe("/uk");
});

test("11: SEO: canonical, hreflang alternates and og:locale on the server render; they follow a switch", async ({
  page,
  request,
}) => {
  const html = await (await get(request, "/uk/admin")).text();
  expect(html).toMatch(/<link rel="canonical" href="https:\/\/example.com\/uk\/admin">/);
  for (const [lang, href] of [
    ["en-US", "/admin"],
    ["uk-UA", "/uk/admin"],
    ["de-AT", "/de-AT/admin"],
    ["x-default", "/admin"],
  ])
    expect(html).toContain(
      `<link rel="alternate" hreflang="${lang}" href="https://example.com${href}">`,
    );
  expect(html).toContain('<meta property="og:locale" content="uk_UA">');
  await page.goto("/uk/admin");
  await hydrated(page);
  await id(page, "switch-de").click();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://example.com/de/admin",
  );
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "de_DE");
});

test("12: page wait, hydration of a page whose namespace the server failed: no request, the unavailable branch; Retry loads once", async ({
  page,
  asked,
}) => {
  await mock.mode({ fail: ["en:account"] });
  await page.goto("/account");
  await hydrated(page);
  await page.waitForLoadState("networkidle");
  await expect(id(page, "account-title")).toHaveText(/^\s*unavailable/);
  expect(asked).toEqual([]);
  await mock.mode({});
  await id(page, "account-retry").click();
  await expect(id(page, "account-title")).toHaveText(EN_ACCOUNT.title);
  // Nested JSON, through the core's normalization.
  await expect(id(page, "account-heading")).toHaveText("Profile of Ada");
  expect(asked).toEqual(["en/account"]);
});

test("13: page wait, a client navigation: the previous page stays until the catalog is in; the loading branch is never shown", async ({
  page,
  asked,
}) => {
  await page.goto("/");
  await hydrated(page);
  await id(page, "layout-count").click();
  await page.evaluate(() => {
    const seen: string[] = ((window as unknown as { __seen: string[] }).__seen = []);
    new MutationObserver(() => {
      const t = document.querySelector('[data-testid="account-title"]')?.textContent?.trim();
      if (t && t !== seen[seen.length - 1]) seen.push(t);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await mock.mode({ hold: ["en:account"] });
  await id(page, "nav-account").click();
  await expect.poll(mock.held).toContain("en:account");
  // Held: the previous page is on screen.
  await expect(id(page, "title")).toHaveText(EN["home.title"]);
  await mock.release("en:account");
  await expect(id(page, "account-title")).toHaveText(EN_ACCOUNT.title);
  expect(await seenTexts(page)).toEqual([EN_ACCOUNT.title]);
  await expect(id(page, "layout-count")).toHaveText("1");
  expect(asked).toEqual(["en/account"]);
});

test("14: page wait, a navigation to a namespace whose route fails: one request, unavailable, nothing unhandled; a revisit asks nothing; Retry once", async ({
  page,
  asked,
}) => {
  await page.goto("/uk");
  await hydrated(page);
  await mock.mode({ fail: ["uk:account", "en:account"] });
  await id(page, "nav-account").click();
  await expect(id(page, "account-title")).toHaveText(/^\s*unavailable/);
  expect(asked.sort()).toEqual(["en/account", "uk/account"]);
  await id(page, "nav-home").click();
  await expect(id(page, "title")).toHaveText(UK["home.title"]);
  await id(page, "nav-account").click();
  await expect(id(page, "account-title")).toHaveText(/^\s*unavailable/);
  expect(asked).toHaveLength(2);
  await mock.mode({});
  // `load(ns)` asks every failed pair of the namespace again: the locale's and the fallback's.
  await id(page, "account-retry").click();
  await expect(id(page, "account-title")).toHaveText(catalog("uk", "account").title);
  expect(asked.slice(2).sort()).toEqual(["en/account", "uk/account"]);
});

test("15: the private source: no session, the route answers 401 and the page renders unavailable; the client build carries no secret", async ({
  request,
}) => {
  const html = await (
    await request.get("/account", { headers: { cookie: "", "accept-language": "en" } })
  ).text();
  expect(testText(html, "account-title")).toMatch(/^unavailable/);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else files.push(path.join(dir, e.name));
  };
  walk(path.join(APP_DIR, ".output/public"));
  const client = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  // Positive control: the browser loader's route is in the client graph.
  expect(client).toContain("/api/i18n/");
  for (const secret of ["comvi-e2e-server-secret-5d1c9f", "comviToken", "comviSource", "45811"])
    expect(client.includes(secret), `${secret} in .output/public`).toBe(false);
  // …and in the server, where it belongs.
  const server = fs.readFileSync(
    path.join(APP_DIR, ".output/server/chunks/nitro/nitro.mjs"),
    "utf8",
  );
  expect(server).toContain("comvi-e2e-server-secret-5d1c9f");
});

test("16: request end: every server instance is destroyed with its request, loads in flight are aborted — after a response, a thrown route, a page that throws, 30 mixed concurrent requests", async ({
  request,
}) => {
  const probe = async (reset = false) =>
    (await (await request.get(`/api/probe${reset ? "?reset" : ""}`)).json()) as {
      created: number;
      destroyed: number;
      aborted: number;
    };
  const settled = async () => {
    await expect
      .poll(async () => {
        const p = await probe();
        return p.created === p.destroyed;
      })
      .toBe(true);
    return probe(true);
  };
  await mock.mode({ hold: ["en:hang"] });
  await probe(true);
  expect((await get(request, "/api/hang")).status()).toBe(200);
  let p = await settled();
  expect(p).toEqual({ created: 1, destroyed: 1, aborted: 1 });
  expect((await get(request, "/api/throw")).status()).toBe(500);
  p = await settled();
  expect(p).toEqual({ created: 1, destroyed: 1, aborted: 1 });
  expect((await get(request, "/boom")).status()).toBe(500);
  p = await settled();
  expect(p.created).toBeGreaterThanOrEqual(1);
  expect(p.aborted).toBeGreaterThanOrEqual(1);
  const urls = ["/", "/uk/admin", "/api/translate", "/api/hang", "/api/throw", "/boom"];
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      get(request, urls[i % urls.length]!, i % 2 ? { "accept-language": "uk" } : {}),
    ),
  );
  p = await settled();
  expect(p.created).toBeGreaterThanOrEqual(30);
  expect(p.destroyed).toBe(p.created);
});
