import fs from "node:fs";
import path from "node:path";
import {
  test as base,
  expect,
  type ConsoleMessage,
  type Page,
  type Request,
} from "@playwright/test";

/**
 * The scenarios every example shows (examples/README.md), asserted identically
 * for all seven through `data-testid`s. One file, one test per step; the step
 * id opens the title (`"k2: …"`) and becomes a column in the runner's table.
 *
 * Run by `scripts/examples-e2e/run.mjs` only: it builds and serves the example
 * and passes the address and the facts below in the environment.
 *
 * Expectations for the critical texts (interpolation, plural, `<T>`, fallback,
 * the missing-parameter placeholder) are LITERALS in this file, not derived
 * from the catalogs: a test that computes its expectation from the same
 * catalog the app reads cannot notice the catalog itself going wrong, and an
 * evaluator that re-implements plural selection can share the app's mistake.
 * Catalog reads remain only for smoke checks (titles, the second page, the
 * list of keys that must never show).
 *
 * Under `--cdn` the mock CDN prefixes every message with `E2E_CDN_MARK`, so a
 * text the app read from the CDN and the same text from its bundled
 * `fallback` imports are different strings: the main phase expects the mark,
 * the dead-CDN phase expects its absence.
 *
 * Every test fails on its own on an uncaught page error or an unexpected
 * `console.error` (the `browserErrors` fixture), so the verdict does not
 * depend on which tests ran before it. A step that cannot apply to an example
 * SKIPS WITH A REASON, and the runner fails any skip its matrix does not list.
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
/**
 * `main`; `cdn-down` for the build against an unreachable CDN; `f15` for the
 * defaultLocale-uk build; `cdn-<step>` for a CDN-steering step on a fresh server.
 */
const PHASE = env("E2E_PHASE");
/** The CDN the app was built against; empty when it reads its bundled catalogs. */
const CDN_URL = env("E2E_CDN_URL");
/** The mock CDN's control surface (lib.mjs `startMockCdn`); empty without `--cdn`. */
const CDN_CONTROL = process.env.E2E_CDN_CONTROL ?? "";
/** What the mock CDN prepends to every message; expected only when the CDN is up. */
const MARK = PHASE !== "cdn-down" && CDN_URL ? env("E2E_CDN_MARK") : "";
const SSR = KIND !== "vite";
/** Nuxt only: each locale's hash-named catalog chunk, from the build's manifest. */
const CATALOG_CHUNKS = JSON.parse(process.env.E2E_CATALOG_CHUNKS || "{}") as Record<string, string>;

const CLIENT_ONLY = "client-rendered example: the locale lives in memory, not in the URL";
const NEEDS_CDN = "needs --cdn";

/** The switcher's locales, plus `ar`: routable/loadable, hidden, right-to-left. */
const LOCALES = ["en", "uk", "de", "ar"] as const;
type Locale = (typeof LOCALES)[number];
type Shown = Exclude<Locale, "ar">;
const SHOWN: Shown[] = ["en", "uk", "de"];

// ── literal expectations ──────────────────────────────────────────────────

/** `greeting.hello` with `{name}` filled. */
const GREETING: Record<Locale, (name: string) => string> = {
  en: (name) => `Hello, ${name}! Good to see you again.`,
  uk: (name) => `Привіт, ${name}! Раді бачити знову.`,
  de: (name) => `Hallo, ${name}! Schön, dich wiederzusehen.`,
  ar: (name) => `مرحبًا يا ${name}! سعداء برؤيتك مجددًا.`,
};

/** `cart.items` at the counts the steps reach; uk 1/2/5 are one/few/many. */
const CART: Record<Shown, Record<0 | 1 | 2 | 3 | 5, string>> = {
  en: {
    0: "Your cart is empty",
    1: "1 item in your cart",
    2: "2 items in your cart",
    3: "3 items in your cart",
    5: "5 items in your cart",
  },
  uk: {
    0: "Ваш кошик порожній",
    1: "1 товар у кошику",
    2: "2 товари у кошику",
    3: "3 товари у кошику",
    5: "5 товарів у кошику",
  },
  de: {
    0: "Ihr Warenkorb ist leer",
    1: "1 Artikel im Warenkorb",
    2: "2 Artikel im Warenkorb",
    3: "3 Artikel im Warenkorb",
    5: "5 Artikel im Warenkorb",
  },
};

/** `docs.read_more` through `<T>`: the paragraph's text and the link's. */
const READ_MORE: Record<Shown, { text: string; link: string }> = {
  en: { text: "Read the Comvi documentation to go further.", link: "Comvi documentation" },
  uk: {
    text: "Прочитайте документацію Comvi, щоб дізнатися більше.",
    link: "документацію Comvi",
  },
  de: { text: "Lies die Comvi-Dokumentation, um weiterzukommen.", link: "Comvi-Dokumentation" },
};

/** `loader.fetched` before its `{locales}`. */
const FETCHED: Record<Shown, string> = {
  en: "Catalogs fetched so far: ",
  uk: "Завантажені каталоги: ",
  de: "Bisher geladene Kataloge: ",
};

/** `fallback.only_en`, which uk lacks everywhere: bundled and on the CDN. */
const ONLY_EN = {
  en: "This sentence is missing from the Ukrainian catalog.",
  de: "Dieser Satz fehlt im ukrainischen Katalog.",
};

const greeting = (locale: Locale, name = "Ada") => MARK + GREETING[locale](name);
const cart = (locale: Shown, count: 0 | 1 | 2 | 3 | 5) => MARK + CART[locale][count];
const readMore = (locale: Shown) => ({
  text: MARK + READ_MORE[locale].text,
  link: READ_MORE[locale].link,
});
const fetched = (locale: Shown, loaded: Locale[]) => MARK + FETCHED[locale] + loaded.join(", ");

// ── catalog reads, for smoke checks only ──────────────────────────────────

type Catalog = { [key: string]: string | Catalog };

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

/** A plain (parameterless) message for a smoke check: the locale's, else en's. */
function message(locale: Locale, key: string): string {
  const value = flat[locale][key] ?? flat.en[key];
  if (value === undefined) throw new Error(`examples/locales has no "${key}" in ${locale} or en`);
  return MARK + value;
}

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

/**
 * What a reader sees in server HTML before any script runs: the markup minus
 * scripts, styles and comments, with the few entities a renderer escapes
 * decoded.
 */
function visibleText(html: string): string {
  return (
    html
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
      .replace(/\s+/g, " ")
  );
}

// ── browser errors, judged per test ───────────────────────────────────────

/**
 * The console messages a dead CDN legitimately produces, and ONLY in the
 * dead-CDN phase: Chromium's own report of the refused connection, for a
 * request to the CDN address itself. Anything else — another URL, another
 * network error, any message from the app or the SDK — still fails the test.
 */
function allowedNetworkMessage(entry: ConsoleMessage): boolean {
  if (PHASE !== "cdn-down" || !CDN_URL) return false;
  return (
    entry.text() === "Failed to load resource: net::ERR_CONNECTION_REFUSED" &&
    entry.location().url.startsWith(CDN_URL)
  );
}

type BrowserErrors = {
  /** Unexpected errors so far in this test. */
  errors: string[];
  /** Watch another page (a second browser context, as in step m) the same way. */
  watch: (page: Page) => void;
};

/**
 * Per test: every console message and uncaught error of every watched page.
 * An uncaught error or a `console.error` outside `allowedNetworkMessage` fails
 * THIS test when it ends, whatever its own assertions said — so a hydration
 * error during step b fails b, and no verdict depends on test order. Every
 * message, error or not, is appended to the runner's console log as a
 * diagnostic, which the runner keeps when anything failed.
 */
const test = base.extend<{ browserErrors: BrowserErrors }>({
  browserErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      const lines: string[] = [];
      const watch = (target: Page) => {
        target.on("console", (entry) => {
          const where = entry.location().url;
          lines.push(`${entry.type()}: ${entry.text()}${where ? ` (${where})` : ""}`);
          if (entry.type() === "error" && !allowedNetworkMessage(entry)) {
            errors.push(`console.error: ${entry.text()}${where ? ` (${where})` : ""}`);
          }
        });
        target.on("pageerror", (error) => {
          lines.push(`uncaught: ${error.message}`);
          errors.push(`uncaught: ${error.message}`);
        });
      };
      watch(page);
      await use({ errors, watch });
      const step = testInfo.title.split(":")[0];
      fs.appendFileSync(CONSOLE_LOG, lines.map((line) => `[${step}] ${line}\n`).join(""));
      if (errors.length > 0) {
        throw new Error(`browser errors during this test:\n${errors.join("\n")}`);
      }
    },
    { auto: true },
  ],
});

// ── navigation helpers ────────────────────────────────────────────────────

function localeOf(target: string): Locale {
  const segment = target.split(/[/?]/)[1] as Locale;
  return LOCALES.includes(segment) ? segment : "en";
}

async function open(page: Page, target = START): Promise<void> {
  await page.goto(target);
  await expect(page.getByTestId("greeting")).toHaveText(greeting(localeOf(target)));
}

/**
 * The home page is live: the SSR examples have hydrated (their `Demo`/page
 * sets `data-hydrated` on mount), and the "catalogs fetched" line — written
 * after mount in next and nuxt — lists at least one locale. A concrete UI
 * state, where the suite used to wait for network idleness.
 */
async function ready(page: Page): Promise<void> {
  if (SSR) {
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  }
  await expect(page.getByTestId("fetched")).toHaveText(/:\s*[a-z]{2}/);
}

/**
 * Click a locale and wait until the page has really arrived there: the button
 * reports itself pressed and the greeting is the new language's. For next and
 * nuxt the click is a navigation, so the URL is checked too. `ar` sits behind a
 * hidden button (it is not in the demo's switcher), clicked through the DOM.
 */
async function switchTo(page: Page, locale: Locale, name = "Ada"): Promise<void> {
  const button = page.getByTestId(`locale-${locale}`);
  if (locale === "ar") {
    await button.evaluate((element: HTMLElement) => element.click());
  } else {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByTestId("greeting")).toHaveText(greeting(locale, name));
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
 *     `loadMessages()` and it arrives inside the RSC payload of the
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

// ── the steps ─────────────────────────────────────────────────────────────

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
  const counter = page.getByTestId("cart");
  for (const locale of SHOWN) {
    if (locale !== "en") await switchTo(page, locale);
    // The counter starts at 2 and an SSR navigation remounts it, so walk it
    // down to 0 first; the `=0` branch is asserted on the way.
    for (let i = 0; i < 6; i++) await page.getByTestId("cart-dec").click();
    await expect(counter).toHaveText(cart(locale, 0));
    let count = 0;
    for (const target of [1, 2, 5] as const) {
      while (count < target) {
        await page.getByTestId("cart-inc").click();
        count++;
      }
      await expect(counter, `${locale}, count ${target}`).toHaveText(cart(locale, target));
    }
  }
});

test("d: <T> renders the link as a real <a href> with translated text", async ({ page }) => {
  await open(page);
  for (const locale of ["en", "uk"] as const) {
    if (locale !== "en") await switchTo(page, locale);
    const paragraph = page.getByTestId("read-more");
    const { text, link } = readMore(locale);
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
  const visible = visibleText(html);
  expect(visible).toContain(greeting("uk"));
  expect(visible).toContain(cart("uk", 2));
  expect(visible).toContain(readMore("uk").text);
  expect(rawKeysIn(visible), "raw keys in the server HTML").toEqual([]);

  // …and the same page, hydrated, is a working app that still shows no key:
  // a catalog the server used but never handed over (say, the fallback
  // locale's) turns into a raw key the moment the client takes over.
  await open(page, "/uk");
  await ready(page);
  expect(rawKeysIn(await pageText(page)), "raw keys after hydration").toEqual([]);
  await page.getByTestId("cart-inc").click();
  await expect(page.getByTestId("cart")).toHaveText(cart("uk", 3));
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
  await ready(page);
  // A prefetch hint the page itself declares for uk's catalog is downloaded
  // at idle priority; wait until the browser has it, so "hinted" is settled
  // before the click instead of racing it.
  const hintedUrls = await page.evaluate(
    (source) =>
      [...document.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]')]
        .map((link) => link.href)
        .filter((href) => new RegExp(source).test(href)),
    pattern.source,
  );
  for (const href of hintedUrls) {
    await page.waitForFunction((url) => performance.getEntriesByName(url).length > 0, href);
  }
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
  // The BUNDLED texts, exactly: MARK is empty in this phase, so these are the
  // demo catalogs' strings, and a CDN-marked text could not match.
  await expect(page.getByTestId("cart")).toHaveText(CART.en[2]);
  await switchTo(page, "uk");
  await expect(page.getByTestId("greeting")).toHaveText(GREETING.uk("Ada"));
  await expect(page.getByTestId("cart")).toHaveText(CART.uk[2]);
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

test("k3: a CDN bundle missing a key falls back to the CDN's en value", async ({ page }) => {
  test.skip(!CDN_URL, NEEDS_CDN);
  await open(page);
  await switchTo(page, "uk");
  // The uk texts carry the CDN's mark: uk came from the CDN…
  await expect(page.getByTestId("greeting")).toHaveText(`${MARK}${GREETING.uk("Ada")}`);
  // …and the key the CDN's uk lacks (lib.mjs `CDN_MISSING`) renders the CDN's
  // en value, which differs from the bundled en value by the mark: neither the
  // bundled en nor the key itself can match.
  await expect(page.getByTestId("fallback")).toHaveText(`${MARK}${ONLY_EN.en}`);
});

test("l: fallbackLocale fills a key uk lacks; an unknown key renders as itself", async ({
  page,
}) => {
  await open(page);
  const fallback = page.getByTestId("fallback");
  const missing = page.getByTestId("missing-key");
  await expect(fallback).toHaveText(MARK + ONLY_EN.en);
  await expect(missing).toHaveText("fallback.nowhere");
  await switchTo(page, "uk");
  await expect(fallback).toHaveText(MARK + ONLY_EN.en);
  await expect(missing).toHaveText("fallback.nowhere");
  await switchTo(page, "de");
  await expect(fallback).toHaveText(MARK + ONLY_EN.de);
});

test("m: the chosen locale persists; a German browser starts in German", async ({
  page,
  browser,
  browserErrors,
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
    browserErrors.watch(german);
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
  await ready(page);
  const seen = await page.evaluate(
    () => (window as unknown as { __greetings: string[] }).__greetings,
  );
  expect(seen, "every text the greeting showed, in order").toEqual([greeting("uk")]);
});

test("p: a missing parameter renders as its own placeholder", async ({ page }) => {
  await open(page);
  const line = page.getByTestId("missing-param");
  // Documented: `t("greeting", {})` on "Hello, {name}!" gives "Hello, {name}!".
  await expect(line).toHaveText(greeting("en", "{name}"));
  await switchTo(page, "uk");
  await expect(line).toHaveText(greeting("uk", "{name}"));
});

/** A parameter that is markup with a handler: it must stay text. */
const PAYLOAD = '<img src=x onerror="window.__pwned=1">';

test("q: an HTML-like parameter renders as text, creates no element, runs nothing", async ({
  page,
  request,
}) => {
  const target = `${START}?name=${encodeURIComponent(PAYLOAD)}`;
  if (SSR) {
    // The HTML that leaves the server holds no tag made from the parameter.
    // Nuxt renders the query on the server, so its server HTML must ALSO show
    // the payload as text — otherwise "no <img>" would pass just because the
    // server ignored ?name=. Next prerenders these pages and never sees the
    // query, so for Next the server check is inherently vacuous; its client
    // render below is the real test.
    const html = await (await request.get(target)).text();
    const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
    expect(markup, "an <img> made from the parameter in the server HTML").not.toMatch(/<img\b/i);
    if (KIND === "nuxt") {
      expect(visibleText(html), "the payload as text in Nuxt's server HTML").toContain(
        greeting(localeOf(START), PAYLOAD),
      );
    }
  }
  // Every request for the payload's `src` is answered here, in arrival order,
  // with a body no browser decodes as an image: an <img> made from the
  // parameter would fire its `onerror`, and nothing reaches the app's server
  // (whose 404 page would log a console error of its own).
  const images: string[] = [];
  await page.route(
    (address) => address.pathname.endsWith("/x"),
    (route) => {
      images.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    },
  );
  await page.goto(target);
  const locale = localeOf(START);
  const line = page.getByTestId("greeting");
  // 1. The literal text, angle brackets and all.
  await expect(line).toHaveText(greeting(locale, PAYLOAD));
  await ready(page);
  // 2. No element from the parameter, in the greeting or anywhere else.
  await expect(line.locator("*")).toHaveCount(0);
  await expect(page.locator("img")).toHaveCount(0);
  // 3. The handler never ran. A CSP could block the handler while the element
  // still exists (caught by 2), and a sanitizer could drop the element after
  // it fired (caught here). An `<img src=x>` the page makes ITSELF has fired
  // its error event once this resolves; its request is answered after any
  // earlier one by the same route, so a payload image inserted before it
  // would have fired too.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const probe = new Image();
        probe.onerror = () => resolve();
        probe.onload = () => resolve();
        probe.src = `x?probe=${Date.now()}`;
      }),
  );
  expect(await page.evaluate(() => (window as { __pwned?: unknown }).__pwned)).toBeUndefined();
  expect(
    images.filter((url) => !url.includes("probe=")),
    "requests for the payload's src",
  ).toEqual([]);
  if (!SSR) {
    // Re-rendered in another locale, the same parameter is still text.
    await switchTo(page, "uk", PAYLOAD);
    await expect(line.locator("*")).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __pwned?: unknown }).__pwned)).toBeUndefined();
  }
});

/** One observed DOM state of the elements step r watches. */
type Frame = {
  greeting: string | null;
  cart: string | null;
  readMore: string | null;
  link: string | null;
  lang: string | null;
  dir: string | null;
  /** Diagnostics only: animation frames painted before this state was recorded. */
  paints: number;
  /** Delivered mutation batches before and including this one. */
  batch: number;
};

/**
 * Which locales a frame's texts belong to. A text that is no locale's
 * expected value (a raw key, an empty string, a half-interpolated message)
 * is returned in `unknown`. An element that is not rendered at all is the
 * documented loading state and belongs to no locale.
 */
function classify(frame: Frame): { locales: Set<Shown>; unknown: string[] } {
  const locales = new Set<Shown>();
  const unknown: string[] = [];
  const fields: Array<[string, string | null, (locale: Shown) => string]> = [
    ["greeting", frame.greeting, (locale) => greeting(locale)],
    ["cart", frame.cart, (locale) => cart(locale, 2)],
    ["read-more", frame.readMore, (locale) => readMore(locale).text],
    ["link", frame.link, (locale) => readMore(locale).link],
  ];
  for (const [field, text, expected] of fields) {
    if (text === null) continue;
    const owners = SHOWN.filter((locale) => expected(locale) === text);
    if (owners.length === 0) unknown.push(`${field}=${JSON.stringify(text)}`);
    for (const owner of owners) locales.add(owner);
  }
  return { locales, unknown };
}

/** What is wrong with one observed state under the strict contract, or null. */
function stateProblem(frame: Frame): string | null {
  const { locales, unknown } = classify(frame);
  if (unknown.length > 0) return `not any locale's text: ${unknown.join(", ")}`;
  if (locales.size > 1) return `mixed languages ${[...locales].join("+")}`;
  if (locales.size === 1) {
    const [locale] = [...locales];
    if (frame.lang !== locale) return `${locale} text under <html lang="${frame.lang}">`;
    if (frame.dir !== null && frame.dir !== "ltr") {
      return `${locale} text under <html dir="${frame.dir}">`;
    }
  }
  return null;
}

test("r: every DOM state during en → uk → de is one whole language, never a key or a mix", async ({
  page,
}) => {
  // The strict contract: every observed state is the old locale in full
  // (text and <html lang> agree), the new locale in full, or the documented
  // loading state (the watched elements not rendered). Anything else fails,
  // however briefly it lasted.
  //
  // Observation rule: one state is one DELIVERED batch of DOM mutations (one
  // MutationObserver callback, at one microtask checkpoint); operations made
  // synchronously inside a batch are not separate states and are not judged.
  //
  // Under --cdn each switch is held at the mock CDN until the barrier sees its
  // catalog in flight, so the state while the catalog is outstanding is
  // observed every run, not when the timing happens to allow it. The paint
  // counter (frames painted so far, per state) is diagnostics in the report
  // and never part of the verdict.
  await page.addInitScript(() => {
    const frames: unknown[] = [];
    (window as unknown as { __frames: unknown[] }).__frames = frames;
    let last = "";
    // Painted frames so far: a MessageChannel task posted from rAF runs once
    // the frame's callbacks, style, layout and paint are done.
    let paints = 0;
    let batch = 0;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      paints++;
    };
    const tick = () => {
      channel.port2.postMessage(null);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
    const record = () => {
      batch++;
      const html = document.documentElement;
      const frame = {
        greeting: text('[data-testid="greeting"]'),
        cart: text('[data-testid="cart"]'),
        readMore: text('[data-testid="read-more"]'),
        link: text('[data-testid="read-more"] a'),
        lang: html.getAttribute("lang"),
        dir: html.getAttribute("dir"),
      };
      const key = JSON.stringify(frame);
      if (key !== last) frames.push({ ...frame, paints, batch });
      last = key;
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["lang", "dir"],
    });
  });
  const start = CDN_CONTROL ? livePath("en") : START;
  await open(page, start);
  await ready(page);
  for (const target of ["uk", "de"] as const) {
    if (CDN_CONTROL) await cdn.mode({ hold: [target] });
    const button = page.getByTestId(`locale-${target}`);
    await button.click();
    if (CDN_CONTROL) {
      await cdn.inFlight("held", [target]);
      await cdn.release(target);
    }
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("greeting")).toHaveText(greeting(target));
    await expect(page.locator("html")).toHaveAttribute("lang", target);
    const path = CDN_CONTROL ? livePath(target) : homePath(target);
    if (SSR) await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`));
  }
  const frames = await page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);

  const violations: string[] = [];
  const order: Shown[] = [];
  for (const [index, frame] of frames.entries()) {
    const problem = stateProblem(frame);
    if (problem) {
      violations.push(`state ${index}: ${problem}`);
      // Diagnostics for the report: whether a paint ran before the next state.
      const next = frames[index + 1];
      test.info().annotations.push({
        type: "finding:mixedState",
        description: JSON.stringify({
          problem,
          lang: frame.lang,
          text: frame.greeting,
          painted: !next || next.paints !== frame.paints,
        }),
      });
      continue;
    }
    const { locales } = classify(frame);
    if (locales.size === 1) {
      const [locale] = [...locales];
      if (order[order.length - 1] !== locale) order.push(locale);
    }
  }
  expect(violations, `${frames.length} states:\n${JSON.stringify(frames, null, 1)}`).toEqual([]);
  // The previous language until the switch lands, then the new one: never
  // back, never a detour through a third.
  expect(order, "the sequence of languages the watched elements showed").toEqual([
    "en",
    "uk",
    "de",
  ]);
});

test("s: F-15 — defaultLocale uk, /uk renders the en value of an en-only key", async ({
  page,
  request,
}) => {
  test.skip(PHASE !== "f15", SSR ? "runs in its own F-15 phase" : "SSR examples only");
  // The variant really is in effect: a visitor whose language matches none
  // of the locales lands on the default, which is now uk.
  const root = await request.get("/", {
    headers: { "accept-language": "fr" },
    maxRedirects: 0,
  });
  expect(root.headers().location ?? "", "where / sends a French browser").toMatch(/\/uk$/);

  // A direct request for /uk. `fallback.only_en` is in en only; en is the
  // fallbackLocale but neither the default nor the visitor's locale here.
  const response = await request.get("/uk");
  expect(response.status(), "GET /uk").toBe(200);
  const visible = visibleText(await response.text());
  expect(visible, "the server HTML").toContain(GREETING.uk("Ada"));
  expect(visible, "the en-only key in the server HTML").toContain(ONLY_EN.en);
  expect(visible).not.toContain("fallback.only_en");

  // …and after hydration, with no hydration error (the browserErrors fixture
  // fails this test on one).
  await page.goto("/uk");
  await ready(page);
  await expect(page.getByTestId("greeting")).toHaveText(GREETING.uk("Ada"));
  await expect(page.getByTestId("fallback")).toHaveText(ONLY_EN.en);
});

// ── steering the mock CDN (t, t2, u, v, v2) ───────────────────────────────

type CdnState = { held: string[]; hanging: string[] };

/** The mock CDN's control surface: what to do with catalog requests from now on. */
const cdn = {
  async mode(mode: {
    hold?: string[];
    hang?: string[];
    corrupt?: string[];
    missing?: Record<string, string[]>;
  }): Promise<void> {
    const response = await fetch(`${CDN_CONTROL}/mode`, {
      method: "POST",
      body: JSON.stringify(mode),
    });
    expect(response.status, "the mock CDN took the mode").toBe(200);
  },
  async state(): Promise<CdnState> {
    return (await (await fetch(`${CDN_CONTROL}/state`)).json()) as CdnState;
  },
  /**
   * The barrier: resolves once a request for every one of `locales` is
   * provably in flight at the mock (withheld or hanging), and fails with what
   * WAS in flight otherwise. Well under the loader's 10 s timeout, so a
   * barrier that never closes cannot turn into a quiet fallback.
   */
  async inFlight(kind: keyof CdnState, locales: string[], timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let state: CdnState = { held: [], hanging: [] };
    while (Date.now() < deadline) {
      state = await cdn.state();
      if (locales.every((locale) => state[kind].includes(locale))) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      `barrier: ${locales.join(" and ")} never all ${kind} at the mock CDN within ` +
        `${timeoutMs / 1000}s (${kind}: [${state[kind].join(", ")}])`,
    );
  },
  /** Answers every withheld request for `locale`; resolves once the answers are written. */
  async release(locale: string): Promise<void> {
    const response = await fetch(`${CDN_CONTROL}/release?locale=${locale}`, { method: "POST" });
    expect(response.status, `the mock CDN held a request for ${locale} to release`).toBe(200);
  },
};

/**
 * Where the CDN-steering steps run: a page the SERVER renders per request.
 * Next's `[locale]` pages are prerendered, so its runtime server never loads a
 * catalog for them; `/<locale>/live` is the same page under `force-dynamic`.
 * Nuxt renders every request (nothing in the example is prerendered), so its
 * own `/<locale>` is that page. The five Vite examples have one page, `/`.
 */
const livePath = (locale: Shown) =>
  KIND === "next" ? `/${locale}/live` : SSR ? `/${locale}` : "/";

/** `promise`, or a failure that says what never happened. */
async function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // If the timer wins, `promise` may still reject later (a Playwright wait
  // hitting its own timeout): handled here, or the runner reports it as an
  // unhandled rejection on top of the real failure.
  promise.catch(() => {});
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} within ${ms / 1000}s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `goto` + `ready`, bounded well inside the test timeout, and attributable
 * when it stalls: every request the page started and never finished, with
 * its age, and every console line, go to the report (`hydrationStalls`) and
 * to the test's attachments before the failure is rethrown. Twice in full
 * runs a t/t2 hydration never completed and the cause was not recorded.
 */
async function hydrateWithDiagnostics(tab: Page, target: string, what: string): Promise<void> {
  const started = Date.now();
  const pending = new Map<Request, number>();
  const consoleLines: string[] = [];
  tab.on("request", (request) => pending.set(request, Date.now()));
  tab.on("requestfinished", (request) => pending.delete(request));
  tab.on("requestfailed", (request) => pending.delete(request));
  tab.on("console", (entry) => consoleLines.push(`${entry.type()}: ${entry.text()}`));
  // Longer than the 15 s bound below, so the bound's message is the one reported.
  tab.setDefaultTimeout(20_000);
  try {
    await tab.goto(target, { waitUntil: "commit" });
    await within(ready(tab), 15_000, `${what}: the page never hydrated`);
  } catch (error) {
    const diagnostics = {
      what,
      target,
      afterMs: Date.now() - started,
      pending: [...pending].map(([request, at]) => ({
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        ageMs: Date.now() - at,
      })),
      console: consoleLines,
      hydrated: await tab
        .evaluate(() => document.documentElement.dataset.hydrated ?? null)
        .catch(() => "unreadable"),
    };
    test.info().annotations.push({
      type: "finding:hydrationStall",
      description: JSON.stringify(diagnostics),
    });
    await test.info().attach(`${what} stall`, {
      body: JSON.stringify(diagnostics, null, 2),
      contentType: "application/json",
    });
    throw error;
  }
}

for (const [step, first] of [
  ["t", "uk"],
  ["t2", "de"],
] as const) {
  const second: Shown = first === "uk" ? "de" : "uk";
  test(`${step}: SSR race — /uk and /de held in flight together, ${first} released first`, async ({
    page,
    browser,
    request,
    browserErrors,
  }) => {
    test.skip(!SSR, "client-rendered example: there is no server render to race");
    test.skip(!CDN_CONTROL, NEEDS_CDN);
    // Two bounded hydrations after the race: room for their diagnostics.
    test.setTimeout(90_000);
    // `fallback.only_en` is dropped from BOTH locales' CDN bundles, so each
    // render needs the en catalog too: the key present only in en.
    const missing = { uk: ["fallback.only_en"], de: ["fallback.only_en"] };
    await cdn.mode({ hold: ["uk", "de"], missing });
    const pending = { uk: request.get(livePath("uk")), de: request.get(livePath("de")) };
    // Both server renders are now waiting on their catalog at the same time.
    await cdn.inFlight("held", ["uk", "de"]);

    const html = {} as Record<"uk" | "de", string>;
    await cdn.release(first);
    const firstResponse = await within(
      pending[first],
      15_000,
      `GET ${livePath(first)} did not answer while ${second}'s catalog was still held`,
    );
    expect(firstResponse.status(), `GET ${livePath(first)}`).toBe(200);
    html[first] = await firstResponse.text();
    expect((await cdn.state()).held, `${second} is still held after ${first} rendered`).toContain(
      second,
    );
    await cdn.release(second);
    const secondResponse = await within(pending[second], 15_000, `GET ${livePath(second)}`);
    expect(secondResponse.status(), `GET ${livePath(second)}`).toBe(200);
    html[second] = await secondResponse.text();

    // Every response in its own locale: <html lang>, the plural, the en-only key.
    for (const locale of ["uk", "de"] as const) {
      const other = locale === "uk" ? "de" : "uk";
      const visible = visibleText(html[locale]);
      expect
        .soft(html[locale], `${locale}: <html lang>`)
        .toMatch(new RegExp(`<html[^>]*\\blang="${locale}"`));
      expect.soft(visible, `${locale}: the title`).toContain(message(locale, "app.title"));
      expect.soft(visible, `${locale}: the greeting`).toContain(greeting(locale));
      expect.soft(visible, `${locale}: the plural`).toContain(cart(locale, 2));
      expect.soft(visible, `${locale}: the en-only key`).toContain(MARK + ONLY_EN.en);
      expect.soft(visible, `${locale}: ${other}'s greeting`).not.toContain(GREETING[other]("Ada"));
      expect.soft(rawKeysIn(visible), `${locale}: raw keys`).toEqual([]);
    }

    // …and each HTML, hydrated as served, stays in its own locale. The
    // document is answered with the raced response itself; everything after
    // it (scripts, a later catalog) comes from the server and the mock.
    await cdn.mode({ missing });
    // A browser context per locale: nothing shared between the two pages,
    // not even the HTTP cache.
    const context = await browser.newContext({ baseURL: BASE_URL });
    for (const locale of ["uk", "de"] as const) {
      const tab = locale === "uk" ? page : await context.newPage();
      if (tab !== page) browserErrors.watch(tab);
      // Routed for the whole test and answered only for the first document
      // request: a `{ times: 1 }` route removes itself mid-load, and requests
      // paused for interception at that moment were seen never to complete.
      let served = false;
      await tab.route(
        (address) => address.pathname === livePath(locale),
        (route) => {
          if (served || !route.request().isNavigationRequest()) return route.continue();
          served = true;
          return route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: html[locale],
          });
        },
      );
      // Hydration is the readiness signal, not `load`: `load` also waits for
      // every prefetch hint, and twice in full runs one such request never
      // completed while the page itself had long hydrated.
      await hydrateWithDiagnostics(tab, livePath(locale), `${locale} hydration`);
      await expect
        .soft(tab.locator("html"), `${locale} hydrated: lang`)
        .toHaveAttribute("lang", locale);
      await expect
        .soft(tab.getByTestId("greeting"), `${locale} hydrated`)
        .toHaveText(greeting(locale));
      await expect.soft(tab.getByTestId("cart"), `${locale} hydrated`).toHaveText(cart(locale, 2));
      await expect
        .soft(tab.getByTestId("fallback"), `${locale} hydrated`)
        .toHaveText(MARK + ONLY_EN.en);
    }
    await context.close();
  });
}

/**
 * The examples whose binding queues locale switches (`@comvi/vue`'s
 * `setLocale` runs one switch after the other): vue, and nuxt on top of it.
 */
const QUEUED_SWITCHES = ["vue", "nuxt"].includes(env("E2E_FRAMEWORK"));

test("u: client race — en → uk → de with uk's catalog answered last stays de", async ({ page }) => {
  test.skip(!CDN_CONTROL, NEEDS_CDN);
  // Every greeting text and <html lang> the page ever shows, in order.
  await page.addInitScript(() => {
    const seen: Array<{ greeting: string | null; lang: string | null }> = [];
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    new MutationObserver(() => {
      const state = {
        greeting: document.querySelector('[data-testid="greeting"]')?.textContent ?? null,
        lang: document.documentElement.getAttribute("lang"),
      };
      const last = seen[seen.length - 1];
      if (!last || last.greeting !== state.greeting || last.lang !== state.lang) seen.push(state);
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["lang"],
    });
  });
  await open(page, livePath("en"));
  await ready(page);

  // Next's browser never fetches a catalog: a switch is a navigation whose
  // RSC request the server answers after loading the catalog from the CDN.
  // Seeing that request settle is how the test knows the stale answer landed.
  const staleRsc = new Promise<void>((resolve) => {
    const settled = (request: Request) => {
      if (/\/uk\/live\?_rsc=/.test(request.url())) resolve();
    };
    page.on("requestfinished", settled);
    page.on("requestfailed", settled);
  });

  await cdn.mode({ hold: ["uk", "de"] });
  await page.getByTestId("locale-uk").click();
  await cdn.inFlight("held", ["uk"]);
  await page.getByTestId("locale-de").click();

  if (QUEUED_SWITCHES) {
    // The Vue binding queues `setLocale`: de's catalog is not even requested
    // while uk's is outstanding, so uk cannot be answered after de. Proven,
    // not assumed: a second later only uk is in flight. uk then applies in
    // its turn and de replaces it, which is what the checks below hold.
    await page.waitForTimeout(1_000);
    expect((await cdn.state()).held, "requests in flight while uk is held").toEqual(["uk"]);
    await cdn.release("uk");
    await cdn.inFlight("held", ["de"]);
    await cdn.release("de");
    await expect(page.getByTestId("greeting")).toHaveText(greeting("de"));
  } else {
    await cdn.inFlight("held", ["uk", "de"]);
    await cdn.release("de");
    await expect(page.getByTestId("greeting")).toHaveText(greeting("de"));
    if (SSR) await expect(page).toHaveURL(new RegExp(`${escapeRegExp(livePath("de"))}$`));
    // uk's answer arrives LAST, after de is on screen.
    await cdn.release("uk");
  }
  if (KIND === "next") {
    await within(staleRsc, 10_000, "the stale /uk/live RSC request never settled");
  } else {
    // The client loader stores the late catalog (it is a valid uk catalog),
    // and only the locale switch it belonged to is discarded: the "fetched"
    // line listing uk is the proof the stale answer was received and handled.
    await expect(page.getByTestId("fetched")).toHaveText(/\buk\b/);
  }
  // Two animation frames and a beat: room for a stale answer to repaint.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 300))),
      ),
  );

  await expect(page.getByTestId("greeting")).toHaveText(greeting("de"));
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByTestId("locale-de")).toHaveAttribute("aria-pressed", "true");
  if (SSR) await expect(page).toHaveURL(new RegExp(`${escapeRegExp(livePath("de"))}$`));
  const seen = await page.evaluate(
    () =>
      (window as unknown as { __seen: Array<{ greeting: string | null; lang: string | null }> })
        .__seen,
  );
  const firstDe = seen.findIndex((state) => state.greeting === greeting("de"));
  expect(
    seen.slice(firstDe).filter((state) => state.greeting === greeting("uk") || state.lang === "uk"),
    `uk shown after de was: ${JSON.stringify(seen)}`,
  ).toEqual([]);
});

for (const [step, fault] of [
  ["v", "hang"],
  ["v2", "corrupt"],
] as const) {
  test(`${step}: CDN ${fault === "hang" ? "hangs" : "answers corrupt JSON"} for uk — the bundled uk renders`, async ({
    page,
  }) => {
    test.skip(!CDN_CONTROL, NEEDS_CDN);
    // The loader's timeout is 10 s; the hang has to outlast it.
    test.setTimeout(60_000);
    await open(page, livePath("en"));
    await ready(page);
    await cdn.mode({ [fault]: ["uk"] });
    await page.getByTestId("locale-uk").click();
    if (fault === "hang") {
      // The hang is real: uk's request is open at the mock, and a second later
      // the page is still English.
      await cdn.inFlight("hanging", ["uk"]);
      await page.waitForTimeout(1_000);
      await expect(page.getByTestId("greeting")).toHaveText(greeting("en"));
    }
    // The documented state: the CDN load failed, so the bundled `fallback`
    // import serves uk. Unmarked texts, so neither the CDN's uk nor en match.
    await expect(page.getByTestId("greeting")).toHaveText(GREETING.uk("Ada"), {
      timeout: 25_000,
    });
    await expect(page.getByTestId("cart")).toHaveText(CART.uk[2]);
    if (SSR) await expect(page).toHaveURL(new RegExp(`${escapeRegExp(livePath("uk"))}$`));
    // …and out of loading: no "Loading…" in any form, no raw key.
    const loading = [flat.en["app.loading"], flat.uk["app.loading"]];
    await expect
      .poll(
        async () => {
          const text = await pageText(page);
          return loading.filter((value) => text.includes(value));
        },
        { message: "a loading indicator is still on the page" },
      )
      .toEqual([]);
    expect(rawKeysIn(await pageText(page))).toEqual([]);
  });
}

// g's verdict is its own pass: since every test fails on its own browser
// errors, g is the dedicated "nothing logged an error" step a reader can find
// in the table, and in the dead-CDN phase (as g2) it is the one step that
// exercises the network allowlist end to end.
test("g: no console errors during a full pass", async ({ page, browserErrors }) => {
  await open(page);
  await ready(page);
  await switchTo(page, "uk");
  await page.getByTestId("cart-inc").click();
  await switchTo(page, "de");
  await ready(page);
  expect(browserErrors.errors).toEqual([]);
});
