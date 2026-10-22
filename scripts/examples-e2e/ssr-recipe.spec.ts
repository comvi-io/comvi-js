import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * The SSR recipes on comvi.io/docs/i18n/ssr, as `examples/sveltekit` and
 * `examples/solidstart` run them: a request-scoped instance on the server,
 * the catalogs handed to the client as data, the locale in the URL (`/` is
 * English, `/uk` Ukrainian).
 *
 * Run by `run.mjs` only, against a production build: `recipe` runs a–d on the
 * example as committed, `pressure` runs e and `shared` runs e2 against the
 * `RECIPE_VARIANTS` builds of it (lib.mjs). As in `scenario.spec.ts`, the
 * critical texts are literals here, and every test fails on its own on a
 * `console.error`, an uncaught error or a hydration warning.
 */

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} is not set — run this through \`pnpm examples:e2e\`.`);
  }
  return value;
};

const LOCALES_DIR = env("E2E_LOCALES_DIR");
const CONSOLE_LOG = env("E2E_CONSOLE_LOG");

const LOCALES = ["en", "uk", "de", "ar"] as const;
type Locale = (typeof LOCALES)[number];

const GREETING: Record<Locale, string> = {
  en: "Hello, Ada! Good to see you again.",
  uk: "Привіт, Ada! Раді бачити знову.",
  de: "Hallo, Ada! Schön, dich wiederzusehen.",
  ar: "مرحبًا يا Ada! سعداء برؤيتك مجددًا.",
};

/** `cart.items` at 1 and 2: uk 2 is `few`, ar 2 is `two`. */
const CART: Record<Locale, [string, string]> = {
  en: ["1 item in your cart", "2 items in your cart"],
  uk: ["1 товар у кошику", "2 товари у кошику"],
  de: ["1 Artikel im Warenkorb", "2 Artikel im Warenkorb"],
  ar: ["منتج واحد في سلتك", "منتجان في سلتك"],
};

/** `docs.read_more` through `<T>`: the paragraph's text. */
const READ_MORE: Record<Locale, string> = {
  en: "Read the Comvi documentation to go further.",
  uk: "Прочитайте документацію Comvi, щоб дізнатися більше.",
  de: "Lies die Comvi-Dokumentation, um weiterzukommen.",
  ar: "اقرأ توثيق Comvi للمزيد.",
};

/** `fallback.only_en`: uk and ar lack it, so the payload must carry en. */
const ONLY_EN: Record<Locale, string> = {
  en: "This sentence is missing from the Ukrainian catalog.",
  uk: "This sentence is missing from the Ukrainian catalog.",
  de: "Dieser Satz fehlt im ukrainischen Katalog.",
  ar: "This sentence is missing from the Ukrainian catalog.",
};

const DIR: Record<Locale, string> = { en: "ltr", uk: "ltr", de: "ltr", ar: "rtl" };

const pathFor = (locale: Locale, page = "/") =>
  locale === "en" ? page : page === "/" ? `/${locale}` : `/${locale}${page}`;

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

const RAW_KEYS = Object.keys(flat.en);
const rawKeysIn = (text: string) => RAW_KEYS.filter((key) => text.includes(key));

/** Server HTML as a reader sees it before any script runs. */
function visibleText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<template\b[\s\S]*?<\/template>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(a|span|strong|em|b|i|code)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function htmlAttribute(html: string, name: string): string | undefined {
  return new RegExp(`<html\\b[^>]*\\b${name}="([^"]*)"`).exec(html)?.[1];
}

/**
 * The text of the element carrying `data-testid`, read off server HTML. A
 * `<template>` is not on screen: streamed SolidStart markup waits in one for
 * a script to swap it in.
 */
function testIdText(html: string, id: string): string | undefined {
  const shown = html.replace(/<template\b[\s\S]*?<\/template>/gi, "");
  const match = new RegExp(`data-testid="${id}"[^>]*>([\\s\\S]*?)</p>`).exec(shown);
  return match ? visibleText(`<p>${match[1]}</p>`).trim() : undefined;
}

// ── browser errors, judged per test ───────────────────────────────────────

/**
 * Svelte reports a hydration mismatch as a `console.warn` and repairs the DOM,
 * so a warning that names hydration fails the test like an error does.
 */
const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      const lines: string[] = [];
      page.on("console", (entry) => {
        lines.push(`${entry.type()}: ${entry.text()}`);
        if (entry.type() === "error" || /hydrat/i.test(entry.text())) {
          errors.push(`console.${entry.type()}: ${entry.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        lines.push(`uncaught: ${error.message}`);
        errors.push(`uncaught: ${error.message}`);
      });
      await use(errors);
      const step = testInfo.title.split(":")[0];
      fs.appendFileSync(CONSOLE_LOG, lines.map((line) => `[${step}] ${line}\n`).join(""));
      if (errors.length > 0) {
        throw new Error(`browser errors during this test:\n${errors.join("\n")}`);
      }
    },
    { auto: true },
  ],
});

async function expectPage(page: Page, locale: Locale): Promise<void> {
  await expect(page.getByTestId("greeting")).toHaveText(GREETING[locale]);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", DIR[locale]);
  await expect(page.getByTestId(`locale-${locale}`)).toHaveAttribute("aria-current", "page");
}

async function expectAbout(page: Page, locale: Locale): Promise<void> {
  await expect(page.getByTestId("about")).toHaveText(flat[locale]["about.body"]);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", DIR[locale]);
}

/**
 * Record when the recipe's effect writes `<html lang>`. The server sends the
 * attribute in the markup, which the parser sets without a mutation record;
 * the layout's effect writes it again only once the app has hydrated, and a
 * write records a mutation even when the value is the same. Call before
 * `goto`.
 */
async function watchHydration(page: Page): Promise<void> {
  await page.addInitScript(() => {
    new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === "lang")) {
        (window as { __hydrated?: boolean }).__hydrated = true;
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["lang"] });
  });
}

/**
 * Wait until the page has hydrated: server HTML shows the same text before
 * any script runs, and a click before hydration is lost (a link click turns
 * into a full page load).
 */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as { __hydrated?: boolean }).__hydrated === true);
}

const sameDocument = (page: Page) =>
  page.evaluate(() => (window as { __sameDocument?: boolean }).__sameDocument);

/** Click a link and check the page did not reload: client navigation only. */
async function follow(page: Page, testId: string, to: string): Promise<void> {
  await page.getByTestId(testId).click();
  await expect(page).toHaveURL((url) => url.pathname === to);
  expect(await sameDocument(page), `following ${testId} to ${to} reloaded the page`).toBe(true);
}

/** Go Back and check the page did not reload. */
async function back(page: Page, to: string): Promise<void> {
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === to);
  expect(await sameDocument(page), `Back to ${to} reloaded the page`).toBe(true);
}

// ── the steps ─────────────────────────────────────────────────────────────

test("a: the server HTML is translated, with <html lang dir>, and readable without JavaScript", async ({
  request,
  browser,
}) => {
  for (const locale of LOCALES) {
    const response = await request.get(pathFor(locale));
    expect(response.status(), `GET ${pathFor(locale)}`).toBe(200);
    const html = await response.text();
    expect(htmlAttribute(html, "lang"), `${locale}: <html lang>`).toBe(locale);
    expect(htmlAttribute(html, "dir"), `${locale}: <html dir>`).toBe(DIR[locale]);
    expect(testIdText(html, "greeting"), `${locale}: greeting`).toBe(GREETING[locale]);
    expect(testIdText(html, "read-more"), `${locale}: <T>`).toBe(READ_MORE[locale]);
    expect(testIdText(html, "only-en"), `${locale}: fallback`).toBe(ONLY_EN[locale]);
    expect(visibleText(html), `${locale}: plural`).toContain(CART[locale][0]);
    expect(rawKeysIn(visibleText(html)), `${locale}: raw keys in the HTML`).toEqual([]);
  }

  for (const locale of ["en", "uk"] as const) {
    const response = await request.get(pathFor(locale, "/about"));
    expect(response.status(), `GET ${pathFor(locale, "/about")}`).toBe(200);
    const about = await response.text();
    expect(htmlAttribute(about, "lang"), `${locale}: about <html lang>`).toBe(locale);
    expect(testIdText(about, "about"), `${locale}: about`).toBe(flat[locale]["about.body"]);
  }

  // A link preview or a reader with scripts off gets the server HTML only.
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto("/uk");
    await expect(page.getByTestId("greeting")).toBeVisible();
    await expect(page.getByTestId("greeting")).toHaveText(GREETING.uk);
  } finally {
    await context.close();
  }
});

test("b: hydration keeps the server's Ukrainian text, then the page answers clicks", async ({
  page,
}) => {
  await watchHydration(page);
  await page.addInitScript(() => {
    const states: string[] = [];
    (window as { __states?: string[] }).__states = states;
    const record = () => {
      const greeting = document.querySelector('[data-testid="greeting"]')?.textContent ?? null;
      const cart = document.querySelector('[data-testid="cart"]')?.textContent ?? null;
      const state = JSON.stringify([document.documentElement.lang, greeting, cart]);
      if (states.at(-1) !== state) states.push(state);
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    document.addEventListener("DOMContentLoaded", record);
  });
  await page.goto("/uk");
  await expectPage(page, "uk");

  await hydrated(page);
  await page.getByTestId("cart-inc").click();
  await expect(page.getByTestId("cart")).toHaveText(CART.uk[1]);

  const states = (await page.evaluate(() => (window as { __states?: string[] }).__states ?? []))
    .map((state) => JSON.parse(state) as [string, string | null, string | null])
    // The parser delivers the page in pieces; judge the states that hold both rows.
    .filter(([, greeting, text]) => greeting !== null && text !== null);
  expect(
    states.map(([lang, greeting, text]) => [lang, greeting, text]),
    "every DOM state from first paint through the click",
  ).toEqual([
    ["uk", GREETING.uk, CART.uk[0]],
    ["uk", GREETING.uk, CART.uk[1]],
  ]);
});

test("c: client navigation switches the text, lang and dir in one document", async ({ page }) => {
  await watchHydration(page);
  await page.goto("/");
  await expectPage(page, "en");
  await hydrated(page);
  await page.evaluate(() => ((window as { __sameDocument?: boolean }).__sameDocument = true));

  await follow(page, "nav-about", "/about");
  await expectAbout(page, "en");

  await follow(page, "nav-home", "/");
  await expectPage(page, "en");

  await follow(page, "locale-uk", "/uk");
  await expectPage(page, "uk");
  await expect(page.getByTestId("only-en")).toHaveText(ONLY_EN.uk);

  await follow(page, "nav-about", "/uk/about");
  await expectAbout(page, "uk");

  await follow(page, "locale-ar", "/ar/about");
  await expectAbout(page, "ar");

  await follow(page, "nav-home", "/ar");
  await expectPage(page, "ar");

  await follow(page, "locale-de", "/de");
  await expectPage(page, "de");

  await follow(page, "locale-en", "/");
  await expectPage(page, "en");

  await back(page, "/de");
  await expectPage(page, "de");
  await back(page, "/ar");
  await expectPage(page, "ar");
});

test("d: a first segment outside the locales is a 404", async ({ request }) => {
  for (const target of ["/xx", "/xx/about", "/en-US", "/uk/xx"]) {
    const response = await request.get(target);
    expect(response.status(), `GET ${target}`).toBe(404);
  }
  // English is unprefixed, and `/en` is a locale like the others.
  for (const target of ["/about", "/en", "/en/about"]) {
    const response = await request.get(target);
    expect(response.status(), `GET ${target}`).toBe(200);
    expect(htmlAttribute(await response.text(), "lang"), `GET ${target}`).toBe("en");
  }
});

async function render(request: APIRequestContext, locale: Locale) {
  const response = await request.get(pathFor(locale));
  const html = await response.text();
  return {
    locale,
    status: response.status(),
    lang: htmlAttribute(html, "lang"),
    greeting: testIdText(html, "greeting"),
    onlyEn: testIdText(html, "only-en"),
  };
}

type Rendered = Awaited<ReturnType<typeof render>>;

const isOwn = (entry: Rendered) =>
  entry.lang === entry.locale &&
  entry.greeting === GREETING[entry.locale] &&
  entry.onlyEn === ONLY_EN[entry.locale];

/** 25 rounds of en, uk, de and ar, all in flight at once. */
async function burst(request: APIRequestContext) {
  const responses = await Promise.all(
    Array.from({ length: 25 }, () => LOCALES.map((locale) => render(request, locale))).flat(),
  );
  expect(responses).toHaveLength(100);
  expect(
    responses.filter((entry) => entry.status !== 200),
    "responses that are not a page",
  ).toEqual([]);
  return { responses, mixed: responses.filter((entry) => !isOwn(entry)) };
}

test("e: concurrent requests in four locales each render their own", async ({ request }) => {
  const { mixed } = await burst(request);
  expect(mixed, "responses rendered in another request's locale").toEqual([]);
});

test("e2: with one instance for every request, the same burst mixes locales", async ({
  request,
}) => {
  // One at a time, the shared build renders every locale right: what the
  // burst finds is a leak between requests, not a build that is wrong anyway.
  for (const locale of LOCALES) {
    const alone = await render(request, locale);
    expect(alone.status, `GET ${pathFor(locale)} alone`).toBe(200);
    expect(isOwn(alone), `GET ${pathFor(locale)} alone: ${JSON.stringify(alone)}`).toBe(true);
  }

  const { mixed } = await burst(request);
  // Each mixed response shows another locale's whole greeting, not an error or a raw key.
  expect(
    mixed.filter(
      (entry) =>
        !LOCALES.some((other) => other !== entry.locale && entry.greeting === GREETING[other]),
    ),
    "mixed responses that are not another locale's text",
  ).toEqual([]);
  expect(
    mixed.length,
    "the shared-instance build rendered every response in its own locale, so step e proves nothing",
  ).toBeGreaterThan(0);
});
