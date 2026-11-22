import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

/**
 * Lot 6a scenarios (owner brief 2026-11-06 §8) on a production build of `test-apps/next`
 * (Next 15) and `test-apps/next16` (Next 16), run by `run.mjs` after its HTTP checks. The
 * catalogs come from the mock of `catalog-mock.mjs`, which the tests steer per (locale,
 * namespace) pair: a held request, a failed one, and the log of who asked for what. Every wait
 * is on a concrete state (a held request, a text, the hydration marker), never on time. Every
 * test fails on its own on a `console.error`, an uncaught error or a hydration warning.
 */

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — run this through \`pnpm test-apps:smoke\`.`);
  return value;
};
const MOCK = env("E2E_MOCK_URL");
const APP_DIR = env("E2E_APP_DIR");
const LOCALES = env("E2E_LOCALES_DIR");

type Entry = { pair: string; from: "server" | "browser"; status: number };
const mock = {
  mode: (m: { hold?: string[]; fail?: string[] }) =>
    fetch(`${MOCK}/__mode`, { method: "POST", body: JSON.stringify(m) }),
  release: (pair: string) =>
    fetch(`${MOCK}/__release`, { method: "POST", body: JSON.stringify({ pair }) }),
  reset: () => fetch(`${MOCK}/__reset`, { method: "POST" }),
  log: async (): Promise<Entry[]> => (await fetch(`${MOCK}/__log`)).json(),
  held: async (): Promise<string[]> => (await fetch(`${MOCK}/__held`)).json(),
};
const catalog = (locale: string, ns = "default"): Record<string, string> =>
  JSON.parse(
    fs.readFileSync(
      path.join(LOCALES, ns === "default" ? `${locale}.json` : `${ns}/${locale}.json`),
      "utf8",
    ),
  );

const test = base.extend<{ errors: string[] }>({
  // Browser time zone UTC; the server formats in Pacific/Kiritimati (UTC+14).
  context: async ({ browser }, use) => {
    const context = await browser.newContext({ timezoneId: "UTC", locale: "en-US" });
    await use(context);
    await context.close();
  },
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      await mock.reset();
      await use(errors);
      expect(errors, "console errors, uncaught errors or hydration warnings").toEqual([]);
    },
    { auto: true },
  ],
});

const hydrated = (page: Page) => expect(page.locator("html[data-hydrated]")).toHaveCount(1);
const text = (page: Page, id: string) => page.getByTestId(id);
/** The markup of `html` without scripts: what is on screen before JavaScript runs. */
const markup = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const testText = (html: string, id: string) =>
  new RegExp(`data-testid="${id}"[^>]*>([^<]*)`).exec(markup(html))?.[1];
const browserAsked = async () => (await mock.log()).filter((e) => e.from === "browser");

const UK = catalog("uk");
const UK_ADMIN = catalog("uk", "admin");
const EN_ADMIN = catalog("en", "admin");
const DE_ADMIN = catalog("de", "admin");

test("1: Server and Client Components: text, param, plural, nested rich text, formatting", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/uk")).text();
  for (const side of ["server", "client"]) {
    expect(testText(html, `${side}-title`)).toBe(UK["home.title"]);
    expect(testText(html, `${side}-param`)).toBe(UK["home.intro"].replace("{name}", "Ada"));
    expect(testText(html, `${side}-plural`)).toMatch(/^2 /);
    expect(testText(html, `${side}-number`)).toMatch(/^1\s234,5$/);
    // Nested rich text: <link><bold>…</bold></link> → <a><b>…</b></a>.
    expect(markup(html)).toMatch(
      new RegExp(
        `data-testid="${side}-rich">[^<]*<a href="https://comvi.io/docs"><b>[^<]+</b></a>`,
      ),
    );
  }
  expect(testText(html, "server-plural")).toBe(testText(html, "client-plural"));
  await page.goto("/uk");
  await hydrated(page);
  for (const id of ["title", "param", "plural", "number", "rich"])
    await expect(text(page, `client-${id}`)).toHaveText(
      (await text(page, `server-${id}`).textContent())!,
    );
  await expect(text(page, "client-rich").locator("a > b")).toHaveCount(1);
});

test("2: a slow server load is in the server HTML; hydration requests nothing", async ({
  page,
  request,
}) => {
  await mock.mode({ hold: ["uk:admin"] });
  let settled = false;
  const response = request.get("/uk/admin").then((r) => ((settled = true), r));
  await expect.poll(mock.held).toContain("uk:admin");
  expect(settled, "the response waits for the held catalog").toBe(false);
  await mock.release("uk:admin");
  const html = await (await response).text();
  expect(testText(html, "admin-server")).toBe(UK_ADMIN["dashboard"]);
  expect(testText(html, "admin-title")).toBe(UK_ADMIN["welcome_admin"]);

  await mock.mode({});
  await page.goto("/uk/admin");
  await hydrated(page);
  await page.waitForLoadState("networkidle");
  await expect(text(page, "admin-title")).toHaveText(UK_ADMIN["welcome_admin"]);
  await expect(text(page, "admin-client")).toHaveAttribute("data-loading", "false");
  expect(await browserAsked()).toEqual([]);
});

test("3: a failed catalog renders the fallback on both sides, stays failed, and retries", async ({
  page,
  request,
}) => {
  await mock.mode({ fail: ["uk:admin"] });
  const html = await (await request.get("/uk/admin")).text();
  expect(testText(html, "admin-server")).toBe(EN_ADMIN["dashboard"]);
  expect(testText(html, "admin-title")).toBe(EN_ADMIN["welcome_admin"]);

  await page.goto("/uk/admin");
  await hydrated(page);
  await page.waitForLoadState("networkidle");
  await expect(text(page, "admin-title")).toHaveText(EN_ADMIN["welcome_admin"]);
  await expect(text(page, "admin-client")).toHaveAttribute("data-loading", "false");
  // null is kept: the browser (which has a loader) does not ask for the failed pair.
  expect(await browserAsked()).toEqual([]);

  // Explicit retry through the browser loader: one request, then Ukrainian.
  await mock.mode({});
  await text(page, "retry-load").click();
  await expect(text(page, "admin-title")).toHaveText(UK_ADMIN["welcome_admin"]);
  expect((await browserAsked()).map((e) => e.pair)).toEqual(["uk:admin"]);

  // Explicit retry through the server: router.refresh() renders the route again.
  await mock.reset();
  await mock.mode({ fail: ["uk:admin"] });
  await page.goto("/uk/admin");
  await hydrated(page);
  await expect(text(page, "admin-title")).toHaveText(EN_ADMIN["welcome_admin"]);
  await mock.mode({});
  await text(page, "retry-refresh").click();
  await expect(text(page, "admin-title")).toHaveText(UK_ADMIN["welcome_admin"]);
  const log = await mock.log();
  expect(log.filter((e) => e.pair === "uk:admin" && e.status === 200).map((e) => e.from)).toEqual([
    "server",
  ]);
  expect(log.filter((e) => e.from === "browser")).toEqual([]);
});

test("3b: a catalog that loaded fails on router.refresh(): the client shows the server's fallback, its state kept", async ({
  page,
}) => {
  await page.goto("/uk/admin");
  await hydrated(page);
  await expect(text(page, "admin-title")).toHaveText(UK_ADMIN["welcome_admin"]);
  await text(page, "admin-count").click();
  await expect(text(page, "admin-count")).toHaveText("1");
  await mock.mode({ fail: ["uk:admin"] });
  await text(page, "retry-refresh").click();
  await expect(text(page, "admin-title")).toHaveText(EN_ADMIN["welcome_admin"]);
  await expect(text(page, "admin-server")).toHaveText(EN_ADMIN["dashboard"]);
  // The same mount: no remount lost the counter.
  await expect(text(page, "admin-count")).toHaveText("1");
  await page.waitForLoadState("networkidle");
  await expect(text(page, "admin-client")).toHaveAttribute("data-loading", "false");
  expect(await browserAsked()).toEqual([]);
});

test("3c: a namespace a later payload brings as failed is not asked for by the browser loader", async ({
  page,
}) => {
  await page.goto("/uk/later");
  await hydrated(page);
  await expect(text(page, "later-title")).toHaveText(UK["home.title"]);
  await text(page, "later-count").click();
  await mock.mode({ fail: ["uk:admin"] });
  await text(page, "later-more").click();
  await expect(text(page, "later-admin")).toHaveText(EN_ADMIN["welcome_admin"]);
  await expect(text(page, "later-count")).toHaveText("1");
  await page.waitForLoadState("networkidle");
  await expect(text(page, "later-admin")).toHaveAttribute("data-loading", "false");
  expect(await browserAsked()).toEqual([]);
});

for (const first of ["de", "uk"] as const) {
  test(`4: two parallel requests in uk and de, ${first} answered first, each in its own locale`, async ({
    request,
  }) => {
    await mock.mode({ hold: ["uk:admin", "de:admin"] });
    const uk = request.get("/uk/admin").then((r) => r.text());
    const de = request.get("/de/admin").then((r) => r.text());
    await expect.poll(async () => (await mock.held()).sort()).toEqual(["de:admin", "uk:admin"]);
    await mock.release(`${first}:admin`);
    const firstHtml = await (first === "de" ? de : uk);
    await mock.release(`${first === "de" ? "uk" : "de"}:admin`);
    const [ukHtml, deHtml] = await Promise.all([uk, de]);
    expect(firstHtml).toBe(first === "de" ? deHtml : ukHtml);
    expect(ukHtml).toMatch(/<html lang="uk"/);
    expect(deHtml).toMatch(/<html lang="de"/);
    expect(testText(ukHtml, "admin-title")).toBe(UK_ADMIN["welcome_admin"]);
    expect(testText(deHtml, "admin-title")).toBe(DE_ADMIN["welcome_admin"]);
    expect(testText(ukHtml, "nav-locale")).toBe("uk");
    expect(testText(deHtml, "nav-locale")).toBe("de");
  });
}

test("5: client navigation, a locale change and two quick switches: the older one never lands", async ({
  page,
}) => {
  await page.goto("/admin");
  await hydrated(page);
  await expect(text(page, "admin-title")).toHaveText(EN_ADMIN["welcome_admin"]);
  // Every text the admin title shows from here on, in order.
  await page.evaluate(() => {
    const seen: string[] = ((window as unknown as { __seen: string[] }).__seen = []);
    const read = () => {
      const t = document.querySelector('[data-testid="admin-title"]')?.textContent;
      if (t && t !== seen[seen.length - 1]) seen.push(t);
    };
    new MutationObserver(read).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await mock.mode({ hold: ["uk:admin"] });
  await text(page, "switch-uk").click();
  await expect.poll(mock.held).toContain("uk:admin");
  await text(page, "switch-de").click();
  await expect(text(page, "admin-title")).toHaveText(DE_ADMIN["welcome_admin"]);
  await expect(text(page, "nav-locale")).toHaveText("de");
  await mock.release("uk:admin");
  await expect
    .poll(async () => (await mock.log()).find((e) => e.pair === "uk:admin")?.status)
    .toBe(200);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(text(page, "admin-title")).toHaveText(DE_ADMIN["welcome_admin"]);
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen).not.toContain(UK_ADMIN["welcome_admin"]);
  expect(page.url()).toMatch(/\/de\/admin$/);
});

test("6: from the admin page to the home page, then a locale switch: admin is not loaded", async ({
  page,
}) => {
  await page.goto("/admin");
  await hydrated(page);
  await expect(text(page, "admin-title")).toHaveText(EN_ADMIN["welcome_admin"]);
  await text(page, "nav-home").click();
  await expect(text(page, "server-title")).toHaveText(catalog("en")["home.title"]);
  await mock.reset();
  await text(page, "switch-uk").click();
  await expect(text(page, "server-title")).toHaveText(UK["home.title"]);
  await expect(text(page, "client-title")).toHaveText(UK["home.title"]);
  await page.waitForLoadState("networkidle");
  expect((await mock.log()).filter((e) => e.pair.endsWith(":admin"))).toEqual([]);
});

test("7: a per-call locale, the time zone and the server's clock keep the first render", async ({
  page,
  request,
}) => {
  const html = await (await request.get("/uk")).text();
  // 2026-01-01 23:30 UTC in Pacific/Kiritimati (the server's zone) is 2 January, 13:30.
  expect(testText(html, "server-date")).toMatch(/13:30/);
  expect(testText(html, "client-date")).toBe(testText(html, "server-date"));
  expect(testText(html, "client-per-call")).toBe(catalog("en")["nav.home"]);
  await page.goto("/uk");
  await hydrated(page);
  // The browser is in UTC: the payload's zone wins, the hydration changes nothing.
  for (const id of ["client-date", "client-relative", "client-per-call"])
    await expect(text(page, id)).toHaveText(testText(html, id)!);
});

test("8: the static page is prerendered, the dynamic one renders per request", async ({
  request,
}) => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(APP_DIR, ".next/prerender-manifest.json"), "utf8"),
  ) as { routes: Record<string, unknown> };
  for (const locale of ["en", "uk", "de", "ar"]) {
    expect(Object.keys(manifest.routes)).toContain(`/${locale}`);
    expect(Object.keys(manifest.routes)).not.toContain(`/${locale}/admin`);
  }
  // A static page asks the catalog source for nothing at request time.
  await request.get("/uk");
  expect(await mock.log()).toEqual([]);
  await request.get("/uk/admin");
  expect((await mock.log()).map((e) => e.pair)).toContain("uk:admin");
});

test("10: the client bundle carries no server code and no server secret", async () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else if (e.name.endsWith(".js")) files.push(path.join(dir, e.name));
  };
  walk(path.join(APP_DIR, ".next/static"));
  const client = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  // Positive control: the client graph is there (the browser loader's public source).
  expect(client).toContain(MOCK);
  for (const secret of [
    "comvi-e2e-server-secret-5d1c9f", // the server loader's credential
    "COMVI_E2E_CATALOGS", // the server-only env name
    "x-comvi-locale", // createGetI18n's request read
    "node:http",
    "getAlternates: unknown locale", // @comvi/next/routing's getAlternates, server-only by use
  ])
    expect(client.includes(secret), `${secret} in a client chunk`).toBe(false);
});

test("10b: the server provider hands the browser data only: the payload and the defined settings", async ({
  request,
}) => {
  for (const path of ["/uk", "/uk/admin"]) {
    const html = await (await request.get(path)).text();
    let flight = "";
    for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g))
      flight += JSON.parse(m[1]) as string;
    // Every provider of the page: its `options` are exactly the instance's fallbackLocale.
    const options = [...flight.matchAll(/"options":(\{[^{}]*\})/g)].map((m) => JSON.parse(m[1]));
    expect(options.length, `${path}: providers in the RSC payload`).toBe(path === "/uk" ? 1 : 2);
    for (const o of options) expect(o).toEqual({ fallbackLocale: "en" });
    expect(flight).toContain('"payload":{"locale":"uk"');
    for (const name of [
      'Pacific/Kiritimati","locales',
      "comvi-e2e-server-secret",
      '"loader"',
      '"onError"',
    ])
      expect(flight.includes(name), `${name} in the RSC payload of ${path}`).toBe(false);
  }
});

const SITE = "https://example.com";
/** The `<link>` tags of `html` as attribute maps, names lower-cased: React writes `hrefLang` and self-closes. */
const linkTags = (html: string) =>
  [...markup(html).matchAll(/<link\b([^>]*)>/gi)].map((tag) => {
    const attrs: Record<string, string> = {};
    for (const a of tag[1].matchAll(/([^\s=/"']+)\s*=\s*"([^"]*)"/g))
      attrs[a[1].toLowerCase()] = a[2];
    return attrs;
  });
const seoLinks = (html: string) => {
  const tags = linkTags(html);
  return {
    canonical: tags.filter((t) => t.rel === "canonical").map((t) => t.href),
    alternates: tags
      .filter((t) => t.rel === "alternate" && "hreflang" in t)
      .map((t) => [t.hreflang, t.href] as const),
  };
};
/** What every page of the stand lists: one hreflang per locale and x-default, the default's URL. */
const hreflangs = (href: string) => {
  const of = (prefix: string) => `${SITE}${prefix}${href === "/" ? "" : href}`;
  return [
    ["en", of("")],
    ...["de", "fr", "es", "uk", "ar"].map((l) => [l, of(`/${l}`)] as const),
    ["x-default", of("")],
  ].sort();
};
const expectSeo = (html: string, canonical: string, href: string) => {
  const { canonical: found, alternates } = seoLinks(html);
  expect(found, "exactly one canonical").toEqual([canonical]);
  expect([...alternates].sort(), "one hreflang per locale and x-default, no more").toEqual(
    hreflangs(href),
  );
};

/**
 * `GET /uk/slow-meta` read as a stream, split at `</head>`. Its metadata waits on the `uk:seo`
 * pair, held here. `release: "after-head"` lets it go only once `</head>` has arrived, so the
 * shell provably went out while the metadata was pending (a client Next does not stream to
 * never gets that far and the poll fails); `"when-asked"` lets it go as soon as it is asked for.
 */
const slowMetaHtml = async (
  base: string,
  headers: Record<string, string>,
  release: "after-head" | "when-asked",
) => {
  await mock.mode({ hold: ["uk:seo"] });
  let html = "";
  // Started before the request: for a bot, Next sends no byte until the metadata resolved.
  const released = (async () => {
    await expect.poll(mock.held).toContain("uk:seo");
    if (release === "after-head") await expect.poll(() => html.includes("</head>")).toBe(true);
    await mock.release("uk:seo");
  })();
  const response = await fetch(`${base}/uk/slow-meta`, { headers });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  await released;
  await mock.mode({});
  expect(html).toContain("</head>");
  const at = html.indexOf("</head>");
  return { head: html.slice(0, at), body: html.slice(at) };
};

/**
 * Did the document survive? A marker on `window` (a full navigation replaces the window) and
 * Playwright's count of main-frame `load` events (a full navigation fires another one).
 */
const watchDocument = async (page: Page) => {
  let loads = 0;
  page.on("load", () => (loads += 1));
  await page.evaluate(() => ((window as unknown as { __b8: string }).__b8 = "same document"));
  return async () => ({
    marker: await page.evaluate(() => (window as unknown as { __b8?: string }).__b8 ?? null),
    loads,
  });
};
const SAME_DOCUMENT = { marker: "same document", loads: 0 };

test("11: SEO: canonical, hreflang alternates and x-default on the server render; they follow a switch", async ({
  page,
  request,
  baseURL,
}) => {
  // 3: the default locale, no prefix. First: a later /uk response sets the locale cookie, and
  // with it `/admin` redirects to `/uk/admin`.
  expectSeo(await (await request.get("/admin")).text(), `${SITE}/admin`, "/admin");
  // 1–2: a dynamic page in a non-default locale.
  expectSeo(await (await request.get("/uk/admin")).text(), `${SITE}/uk/admin`, "/admin");
  // 4: the static page; scenario 8 proves it is still in prerender-manifest.json.
  expectSeo(await (await request.get("/uk")).text(), `${SITE}/uk`, "/");
  // 5: a bot without JavaScript gets every tag before </head>, not streamed into <body>.
  const bot = await (
    await request.get("/uk/admin", { headers: { "user-agent": "facebookexternalhit/1.1" } })
  ).text();
  expect(bot).toContain("</head>");
  expectSeo(bot.slice(0, bot.indexOf("</head>")), `${SITE}/uk/admin`, "/admin");
  // 5, where it can fail: /slow-meta's metadata resolves only after the page shell. An ordinary
  // client gets </head> first and the tags streamed into <body>; the bot gets them in <head>.
  const ordinary = await slowMetaHtml(baseURL!, {}, "after-head");
  expect(seoLinks(ordinary.head), "nothing in <head> for an ordinary client").toEqual({
    canonical: [],
    alternates: [],
  });
  expectSeo(ordinary.body, `${SITE}/uk/slow-meta`, "/slow-meta");
  const slowBot = await slowMetaHtml(
    baseURL!,
    { "user-agent": "facebookexternalhit/1.1" },
    "when-asked",
  );
  expectSeo(slowBot.head, `${SITE}/uk/slow-meta`, "/slow-meta");
  expect(seoLinks(slowBot.body), "nothing streamed after </head> for the bot").toEqual({
    canonical: [],
    alternates: [],
  });

  // 6: a client switch replaces the tags, without a full reload in between.
  await page.goto("/uk/admin");
  await hydrated(page);
  const documentState = await watchDocument(page);
  const head = async () => seoLinks(await page.content());
  await text(page, "switch-de").click();
  await expect(page).toHaveURL(/\/de\/admin$/);
  await expect.poll(async () => (await head()).canonical).toEqual([`${SITE}/de/admin`]);
  expect(await documentState(), "no full reload on the switch to de").toEqual(SAME_DOCUMENT);
  await text(page, "switch-en").click();
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/admin$/);
  await expect.poll(async () => (await head()).canonical).toEqual([`${SITE}/admin`]);
  expect(await documentState(), "no full reload on the switch to en").toEqual(SAME_DOCUMENT);
  expect([...(await head()).alternates].sort()).toEqual(hreflangs("/admin"));
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(7);
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    "href",
    `${SITE}/admin`,
  );
});

test("11b: the no-reload check of scenario 11 fails on a full reload or a full navigation", async ({
  page,
}) => {
  await page.goto("/uk/admin");
  await hydrated(page);
  const reload = await watchDocument(page);
  await page.reload();
  await hydrated(page);
  await expect.poll(reload).toEqual({ marker: null, loads: 1 });

  const assign = await watchDocument(page);
  await page.evaluate(() => location.assign("/de/admin"));
  await expect(page).toHaveURL(/\/de\/admin$/);
  await hydrated(page);
  await expect.poll(assign).toEqual({ marker: null, loads: 1 });
});
