import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page, type Request } from "@playwright/test";

/**
 * The scenarios every example shows (examples/README.md), asserted identically
 * for all seven through `data-testid`s. One file, one test per step; the step
 * id opens the title (`"k2: …"`) and becomes a column in the runner's table.
 *
 * Run by `scripts/examples-e2e/run.mjs` only: it builds and serves the example
 * and passes the address and the facts below in the environment.
 *
 * Every expected string is DERIVED from `examples/locales/*.json` at run time,
 * never copied into this file: the assertion is "the page says what the
 * catalog says", so editing a catalog cannot leave a stale expectation behind,
 * and a page that renders a raw key or the wrong plural branch cannot match.
 *
 * A step that cannot apply to an example SKIPS WITH A REASON (`test.skip(cond,
 * reason)`), and the runner prints the reason under the table. Nothing is
 * left out silently.
 */

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is not set — run this through \`pnpm examples:e2e\`.`);
  }
  return value;
};

const KIND = env("E2E_KIND");
const START = env("E2E_START_PATH");
const LOCALES_DIR = env("E2E_LOCALES_DIR");
const CONSOLE_LOG = env("E2E_CONSOLE_LOG");
const BASE_URL = env("E2E_BASE_URL");
/** `main`, or `cdn-down` for the run against an unreachable CDN (step k2 only). */
const PHASE = env("E2E_PHASE");
/** The CDN the app was built against; empty when it reads its bundled catalogs. */
const CDN_URL = env("E2E_CDN_URL");
const SSR = KIND !== "vite";
/** Nuxt only: each locale's hash-named catalog chunk, from the build's manifest. */
const CATALOG_CHUNKS = JSON.parse(process.env.E2E_CATALOG_CHUNKS || "{}") as Record<string, string>;

const CLIENT_ONLY = "client-rendered example: the locale lives in memory, not in the URL";
const NEEDS_CDN = "needs --cdn";

type Catalog = { [key: string]: string | Catalog };
/** The switcher's locales, plus `ar`: routable/loadable, hidden, right-to-left. */
const LOCALES = ["en", "uk", "de", "ar"] as const;
type Locale = (typeof LOCALES)[number];

function flatten(catalog: Catalog, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(catalog)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[full] = value;
    else Object.assign(out, flatten(value, full));
  }
  return out;
}

const flat = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    flatten(
      JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8")) as Catalog,
    ),
  ]),
) as Record<Locale, Record<string, string>>;

/** Every key in the catalogs — none may ever appear in rendered text. */
const RAW_KEYS = Object.keys(flat.en);

/**
 * What a correct host renders for `key` under `locale`: the locale's own
 * value, else the `fallbackLocale` (en) value. Every example sets
 * `fallbackLocale: "en"`.
 */
function message(locale: Locale, key: string): string {
  const value = flat[locale][key] ?? flat.en[key];
  if (value === undefined) throw new Error(`examples/locales has no "${key}" in ${locale} or en`);
  return value;
}

/** `{name}`-style substitution, the only interpolation the plain keys use. */
function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}

/**
 * The branch of an ICU `plural` a correct compiler picks for `n`: an exact
 * `=n` first, then the CLDR category from `Intl.PluralRules` — which is what
 * makes uk's 1/2/5 land on one/few/many — with `#` as the formatted number.
 */
function plural(locale: Locale, key: string, n: number): string {
  const source = message(locale, key);
  const branches = new Map<string, string>();
  for (const match of source.matchAll(/(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g)) {
    branches.set(match[1], match[2]);
  }
  const branch =
    branches.get(`=${n}`) ??
    branches.get(new Intl.PluralRules(locale).select(n)) ??
    branches.get("other");
  if (branch === undefined) throw new Error(`no plural branch for ${n} in ${locale}:${key}`);
  return branch.replace(/#/g, new Intl.NumberFormat(locale).format(n));
}

/** `docs.read_more` as text, and the text inside its `<link>`. */
function tagged(locale: Locale): { text: string; link: string } {
  const source = message(locale, "docs.read_more");
  const link = /<link>(.*?)<\/link>/.exec(source)?.[1];
  if (!link) throw new Error(`${locale}:docs.read_more has no <link>…</link>`);
  return { text: source.replace(/<\/?link>/g, ""), link };
}

const greeting = (locale: Locale) => fill(message(locale, "greeting.hello"), { name: "Ada" });
const fetched = (locale: Locale, loaded: Locale[]) =>
  fill(message(locale, "loader.fetched"), { locales: loaded.join(", ") });

function rawKeysIn(text: string): string[] {
  return RAW_KEYS.filter((key) => text.includes(key));
}

/**
 * The page's text as the DOM holds it. Not `innerText`: that applies CSS, and
 * the examples' `h2 { text-transform: uppercase }` turns a leaked
 * `app.language` into `APP.LANGUAGE`, which no key matches — a probe caught
 * exactly that. Script and style bodies are skipped (Next inlines its payload).
 */
async function pageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement?.tagName;
      if (parent && ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(parent)) continue;
      parts.push(node.textContent ?? "");
    }
    return parts.join(" ");
  });
}

/** Attach the console and page-error listeners step g judges, to any page. */
function watch(page: Page, errors: string[]): void {
  page.on("console", (entry) => {
    if (entry.type() === "error") errors.push(`console.error: ${entry.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
}

/**
 * Every page gets console and page-error listeners, and whatever they catch is
 * appended to a file the runner owns. Step g reads that file, so it judges the
 * WHOLE run — a hydration error thrown during step b still fails g even
 * though b's own assertions passed. A page a test opens itself (step m) is
 * passed to `watch` with the same array.
 */
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      watch(page, errors);
      await use(errors);
      if (errors.length > 0) {
        const step = testInfo.title.split(":")[0];
        fs.appendFileSync(CONSOLE_LOG, errors.map((error) => `[${step}] ${error}\n`).join(""));
      }
    },
    { auto: true },
  ],
});

/** Everything but k2 runs in the main phase; k2 runs alone against a dead CDN. */
// Playwright requires the fixtures argument to be a destructuring pattern, even an empty one.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  const isK2 = testInfo.title.startsWith("k2:");
  if (PHASE === "cdn-down") test.skip(!isK2, "the dead-CDN phase runs k2 only");
});

function localeOf(target: string): Locale {
  const segment = target.split("/")[1] as Locale;
  return LOCALES.includes(segment) ? segment : "en";
}

async function open(page: Page, target = START): Promise<void> {
  await page.goto(target);
  await expect(page.getByTestId("greeting")).toHaveText(greeting(localeOf(target)));
}

/**
 * Click a locale and wait until the page has really arrived there: the button
 * reports itself pressed and the greeting is the new language's. For next and
 * nuxt the click is a navigation, so the URL is checked too. `ar` sits behind a
 * hidden button (it is not in the demo's switcher), clicked through the DOM.
 */
async function switchTo(page: Page, locale: Locale): Promise<void> {
  const button = page.getByTestId(`locale-${locale}`);
  if (locale === "ar") {
    await button.evaluate((element: HTMLElement) => element.click());
  } else {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByTestId("greeting")).toHaveText(greeting(locale));
  if (SSR) await expect(page).toHaveURL(new RegExp(`/${locale}$`));
}

/** The path a second page lives at, per kind. */
const aboutPath = (locale: Locale) => (SSR ? `/${locale}/about` : "/about");
const homePath = (locale: Locale) => (SSR ? `/${locale}` : "/");

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The request that proves `locale`'s catalog was fetched, per kind and mode.
 *
 *   - `--cdn`, vite and nuxt: the browser asks the CDN for `{cdnUrl}/{locale}.json`.
 *   - vite: the import map's dynamic `import()` is its own chunk, `assets/<locale>-<hash>.js`.
 *   - nuxt: the same chunk under `/_nuxt/`, hash-named, so the runner reads its
 *     name from the client manifest.
 *   - next: the browser never imports a catalog — the server resolves it in
 *     `loadTranslations()` and it arrives inside the RSC payload of the
 *     navigation, which is the request for `/<locale>?_rsc=…`.
 */
function catalogRequest(locale: Locale): RegExp {
  if (KIND === "next") return new RegExp(`/${locale}\\?_rsc=`);
  if (CDN_URL) return new RegExp(`^${escapeRegExp(`${CDN_URL}/${locale}.json`)}$`);
  if (KIND === "vite") return new RegExp(`/assets/${locale}-[^/]+\\.js$`);
  const chunk = CATALOG_CHUNKS[locale];
  if (!chunk) throw new Error(`the runner found no catalog chunk for ${locale} in Nuxt's manifest`);
  return new RegExp(`${escapeRegExp(chunk)}$`);
}

test("a: the initial render shows real text, never a raw key", async ({ page }) => {
  await open(page);
  await expect(page.locator("h1")).toHaveText(message("en", "app.title"));
  const text = await pageText(page);
  expect(rawKeysIn(text), "raw keys in the rendered page").toEqual([]);
});

test("b: the switcher changes en → uk → de", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("locale-en")).toHaveAttribute("aria-pressed", "true");
  for (const locale of ["uk", "de"] as const) {
    await switchTo(page, locale);
    await expect(page.locator("h1")).toHaveText(message(locale, "app.title"));
    expect(rawKeysIn(await pageText(page))).toEqual([]);
  }
});

test("c: the plural counter renders 0/1/2/5 in en, uk and de", async ({ page }) => {
  await open(page);
  const cart = page.getByTestId("cart");
  for (const locale of ["en", "uk", "de"] as const) {
    if (locale !== "en") await switchTo(page, locale);
    // The counter starts at 2 and an SSR navigation remounts it, so walk it
    // down to 0 first; the `=0` branch is asserted on the way.
    for (let i = 0; i < 6; i++) await page.getByTestId("cart-dec").click();
    await expect(cart).toHaveText(plural(locale, "cart.items", 0));
    let count = 0;
    for (const target of [1, 2, 5]) {
      while (count < target) {
        await page.getByTestId("cart-inc").click();
        count++;
      }
      await expect(cart, `${locale}, count ${target}`).toHaveText(
        plural(locale, "cart.items", target),
      );
    }
  }
});

test("d: <T> renders the link as a real <a href> with translated text", async ({ page }) => {
  await open(page);
  for (const locale of ["en", "uk"] as const) {
    if (locale !== "en") await switchTo(page, locale);
    const paragraph = page.getByTestId("read-more");
    const { text, link } = tagged(locale);
    await expect(paragraph).toHaveText(text);
    const anchor = paragraph.locator("a");
    await expect(anchor).toHaveCount(1);
    await expect(anchor).toHaveText(link);
    await expect(anchor).toHaveAttribute("href", "https://comvi.io/docs");
  }
});

test("e: catalogs load lazily, one per visited locale", async ({ page }) => {
  await open(page);
  const line = page.getByTestId("fetched");
  await expect(line).toHaveText(fetched("en", ["en"]));
  await switchTo(page, "uk");
  await expect(line).toHaveText(fetched("uk", ["en", "uk"]));
  await switchTo(page, "de");
  await expect(line).toHaveText(fetched("de", ["en", "uk", "de"]));
});

test("f: SSR — plain-HTTP /uk is already translated, then hydrates", async ({ page, request }) => {
  test.skip(!SSR, "client-rendered example: there is no server HTML to read");
  const response = await request.get("/uk");
  expect(response.status(), "GET /uk").toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<html[^>]*\blang="uk"/);
  // What a reader sees before any script runs: the markup minus scripts,
  // styles and comments, with the few entities a renderer escapes decoded.
  const visible = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Inline tags join their neighbours ("Comvi</a>, щоб"); block tags separate.
    .replace(/<\/?(a|span|strong|em|b|i|code)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  expect(visible).toContain(greeting("uk"));
  expect(visible).toContain(plural("uk", "cart.items", 2));
  expect(visible).toContain(tagged("uk").text);
  expect(rawKeysIn(visible), "raw keys in the server HTML").toEqual([]);

  // …and the same page, hydrated, is a working app that still shows no key:
  // a catalog the server used but never handed over (say, the fallback
  // locale's) turns into a raw key the moment the client takes over.
  await open(page, "/uk");
  await page.waitForLoadState("networkidle");
  expect(rawKeysIn(await pageText(page)), "raw keys after hydration").toEqual([]);
  await page.getByTestId("cart-inc").click();
  await expect(page.getByTestId("cart")).toHaveText(plural("uk", "cart.items", 3));
  await switchTo(page, "de");
});

test("h: a second page is translated and the locale survives navigation", async ({ page }) => {
  await open(page);
  await switchTo(page, "uk");
  await page.getByTestId("nav-about").click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(aboutPath("uk"))}$`));
  await expect(page.getByTestId("about-body")).toHaveText(message("uk", "about.body"));
  await expect(page.locator("h1")).toHaveText(message("uk", "app.title"));
  expect(rawKeysIn(await pageText(page))).toEqual([]);

  // Back by link…
  await page.getByTestId("nav-home").click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(homePath("uk"))}$`));
  await expect(page.getByTestId("greeting")).toHaveText(greeting("uk"));

  // …and back by the browser's Back button.
  await page.getByTestId("nav-about").click();
  await expect(page.getByTestId("about-body")).toHaveText(message("uk", "about.body"));
  await page.goBack();
  await expect(page.getByTestId("greeting")).toHaveText(greeting("uk"));
});

test("i: locale in the URL — /de renders German, switching navigates, Back restores", async ({
  page,
}) => {
  test.skip(!SSR, CLIENT_ONLY);
  await open(page, "/de");
  await expect(page.locator("h1")).toHaveText(message("de", "app.title"));
  await expect(page.getByTestId("locale-de")).toHaveAttribute("aria-pressed", "true");
  await switchTo(page, "uk");
  await page.goBack();
  await expect(page).toHaveURL(/\/de$/);
  await expect(page.getByTestId("greeting")).toHaveText(greeting("de"));
  await expect(page.getByTestId("locale-de")).toHaveAttribute("aria-pressed", "true");
});

test("j: a catalog is requested only when its locale is first needed", async ({ page }) => {
  const pattern = catalogRequest("uk");
  const early: string[] = [];
  const hinted: string[] = [];
  const record = async (request: Request) => {
    if (!pattern.test(request.url())) return;
    // Nuxt writes `<link rel="prefetch">` for every dynamic chunk by default:
    // an idle-priority download HINT, not a load — the module is not run until
    // the import asks for it, and that import is then served from the cache.
    const purpose =
      (await request.headerValue("sec-purpose")) ?? (await request.headerValue("purpose"));
    (purpose?.includes("prefetch") ? hinted : early).push(request.url());
  };
  page.on("request", record);
  await open(page);
  await page.waitForLoadState("networkidle");
  page.off("request", record);
  expect(early, `uk's catalog (${pattern}) was loaded before uk was chosen`).toEqual([]);

  // A prefetched chunk is imported from the cache, which fires no request; for
  // everything else the request on the click IS the proof.
  const onDemand =
    hinted.length > 0 ? null : page.waitForRequest((request) => pattern.test(request.url()));
  await page.getByTestId("locale-uk").click();
  if (onDemand) await onDemand;
  await expect(page.getByTestId("greeting")).toHaveText(greeting("uk"));
});

test("k2: CDN down — the bundled fallback imports serve the catalogs", async ({ page }) => {
  test.skip(PHASE !== "cdn-down", CDN_URL ? "runs in its own dead-CDN phase" : NEEDS_CDN);
  const failed: string[] = [];
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(CDN_URL)) failed.push(request.url());
  });
  await open(page);
  await expect(page.getByTestId("cart")).toHaveText(plural("en", "cart.items", 2));
  await switchTo(page, "uk");
  await expect(page.getByTestId("cart")).toHaveText(plural("uk", "cart.items", 2));
  expect(rawKeysIn(await pageText(page))).toEqual([]);
  // Proof the CDN was really in the path and really down, rather than the app
  // quietly built without it. Next is the exception: its browser never fetches
  // a catalog (the server does, at build time here), so there is nothing to see.
  if (KIND !== "next") {
    expect(
      failed.length,
      `no failed request to ${CDN_URL} — was the CDN ever tried?`,
    ).toBeGreaterThan(0);
  }
});

test("k3: a CDN bundle missing a key falls back to the en value", async ({ page }) => {
  test.skip(!CDN_URL, NEEDS_CDN);
  // The mock CDN serves examples/locales verbatim, and its uk bundle is the
  // one without `fallback.only_en`.
  expect(flat.uk["fallback.only_en"], "uk's CDN bundle should lack the key").toBeUndefined();
  await open(page);
  await switchTo(page, "uk");
  await expect(page.getByTestId("fallback")).toHaveText(flat.en["fallback.only_en"]);
});

test("l: fallbackLocale fills a key uk lacks; an unknown key renders as itself", async ({
  page,
}) => {
  await open(page);
  const fallback = page.getByTestId("fallback");
  const missing = page.getByTestId("missing-key");
  await expect(fallback).toHaveText(flat.en["fallback.only_en"]);
  await expect(missing).toHaveText("fallback.nowhere");
  await switchTo(page, "uk");
  await expect(fallback).toHaveText(flat.en["fallback.only_en"]);
  await expect(missing).toHaveText("fallback.nowhere");
  await switchTo(page, "de");
  await expect(fallback).toHaveText(flat.de["fallback.only_en"]);
});

test("m: the chosen locale persists; a German browser starts in German", async ({
  page,
  browser,
  consoleErrors,
}) => {
  // A returning visitor: choose uk, reload.
  await open(page);
  await switchTo(page, "uk");
  await page.reload();
  await expect(page.getByTestId("greeting")).toHaveText(greeting("uk"));
  if (SSR) {
    // …and come back to the bare root: the middleware's cookie sends them to uk.
    await page.goto("/");
    await expect(page).toHaveURL(/\/uk$/);
    await expect(page.getByTestId("greeting")).toHaveText(greeting("uk"));
  }

  // A first visit from a German browser (navigator.language and Accept-Language).
  const context = await browser.newContext({ locale: "de-DE", baseURL: BASE_URL });
  try {
    const german = await context.newPage();
    watch(german, consoleErrors);
    await german.goto("/");
    await expect(german.getByTestId("greeting")).toHaveText(greeting("de"));
    if (SSR) await expect(german).toHaveURL(/\/de$/);
  } finally {
    await context.close();
  }
});

test("n: <html lang> and dir follow the locale, rtl for ar", async ({ page }) => {
  await open(page);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "en");
  await expect(html).toHaveAttribute("dir", "ltr");
  await switchTo(page, "uk");
  await expect(html).toHaveAttribute("lang", "uk");
  await expect(html).toHaveAttribute("dir", "ltr");
  await switchTo(page, "ar");
  await expect(html).toHaveAttribute("lang", "ar");
  await expect(html).toHaveAttribute("dir", "rtl");
  // ar has two keys of its own; everything else falls back to en, not to keys.
  await expect(page.locator("h1")).toHaveText(message("ar", "app.title"));
  expect(rawKeysIn(await pageText(page))).toEqual([]);
  await switchTo(page, "en");
  await expect(html).toHaveAttribute("dir", "ltr");
});

test("o: SSR — the greeting is right from first paint through hydration", async ({ page }) => {
  test.skip(!SSR, "client-rendered example: there is no server-rendered first paint");
  // Installed before the document exists, so it sees the greeting the moment
  // the parser inserts it, and every change after that.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __greetings: string[] }).__greetings = seen;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="greeting"]')?.textContent ?? null;
      if (text !== null && seen[seen.length - 1] !== text) seen.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto("/uk");
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  await page.waitForLoadState("networkidle");
  const seen = await page.evaluate(
    () => (window as unknown as { __greetings: string[] }).__greetings,
  );
  expect(seen, "every text the greeting showed, in order").toEqual([greeting("uk")]);
});

test("p: a missing parameter renders as its own placeholder", async ({ page }) => {
  await open(page);
  const line = page.getByTestId("missing-param");
  // Documented: `t("greeting", {})` on "Hello, {name}!" gives "Hello, {name}!".
  await expect(line).toHaveText(message("en", "greeting.hello"));
  await switchTo(page, "uk");
  await expect(line).toHaveText(message("uk", "greeting.hello"));
});

// Last on purpose: tests run in file order, so g's verdict covers every step
// above it.
test("g: no console errors during the run", async ({ page, consoleErrors }) => {
  // One more full pass of its own, so g has something to say even with
  // `--grep g`; then the verdict covers every step that ran before it.
  await open(page);
  await switchTo(page, "uk");
  await page.getByTestId("cart-inc").click();
  await switchTo(page, "de");
  await page.waitForLoadState("networkidle");
  const earlier = fs.existsSync(CONSOLE_LOG)
    ? fs.readFileSync(CONSOLE_LOG, "utf8").split("\n").filter(Boolean)
    : [];
  expect([...earlier, ...consoleErrors.map((error) => `[g] ${error}`)]).toEqual([]);
});
