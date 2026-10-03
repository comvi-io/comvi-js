import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

/**
 * The one scenario every example shows (examples/README.md, "What each example
 * shows"), asserted identically for all seven through `data-testid`s.
 *
 * Run by `scripts/examples-e2e/run.mjs` only: it builds and serves the example
 * and passes the address and the facts below in the environment.
 *
 * Every expected string is DERIVED from `examples/locales/*.json` at run time,
 * never copied into this file: the assertion is "the page says what the
 * catalog says", so editing a catalog cannot leave a stale expectation behind,
 * and a page that renders a raw key or the wrong plural branch cannot match.
 */

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — run this through \`pnpm examples:e2e\`.`);
  return value;
};

const KIND = env("E2E_KIND");
const START = env("E2E_START_PATH");
const LOCALES_DIR = env("E2E_LOCALES_DIR");
const CONSOLE_LOG = env("E2E_CONSOLE_LOG");
const SSR = KIND !== "vite";

type Catalog = { [key: string]: string | Catalog };
const LOCALES = ["en", "uk", "de"] as const;
type Locale = (typeof LOCALES)[number];

const catalogs = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8")) as Catalog,
  ]),
) as Record<Locale, Catalog>;

function flatten(catalog: Catalog, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(catalog)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[full] = value;
    else Object.assign(out, flatten(value, full));
  }
  return out;
}

const flat = Object.fromEntries(LOCALES.map((l) => [l, flatten(catalogs[l])])) as Record<
  Locale,
  Record<string, string>
>;

/** Every key in the catalogs — none may ever appear in rendered text. */
const RAW_KEYS = Object.keys(flat.en);

function message(locale: Locale, key: string): string {
  const value = flat[locale][key];
  if (value === undefined) throw new Error(`examples/locales/${locale}.json has no "${key}"`);
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

function rawKeysIn(text: string): string[] {
  return RAW_KEYS.filter((key) => text.includes(key));
}

/**
 * Every page gets console and page-error listeners, and whatever they catch is
 * appended to a file the runner owns. Step g reads that file, so it judges the
 * WHOLE run — a hydration error thrown during step b still fails g even
 * though b's own assertions passed.
 */
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("console", (entry) => {
        if (entry.type() === "error") errors.push(`console.error: ${entry.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
      await use(errors);
      if (errors.length > 0) {
        const step = testInfo.title.split(":")[0];
        fs.appendFileSync(CONSOLE_LOG, errors.map((error) => `[${step}] ${error}\n`).join(""));
      }
    },
    { auto: true },
  ],
});

async function open(page: Page, target = START): Promise<void> {
  await page.goto(target);
  await expect(page.getByTestId("greeting")).toHaveText(greeting(localeOf(target)));
}

function localeOf(target: string): Locale {
  const segment = target.split("/")[1] as Locale;
  return LOCALES.includes(segment) ? segment : "en";
}

/**
 * Click a locale and wait until the page has really arrived there: the button
 * reports itself pressed and the greeting is the new language's. For next and
 * nuxt the click is a navigation, so the URL is checked too.
 */
async function switchTo(page: Page, locale: Locale): Promise<void> {
  await page.getByTestId(`locale-${locale}`).click();
  await expect(page.getByTestId(`locale-${locale}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("greeting")).toHaveText(greeting(locale));
  if (SSR) await expect(page).toHaveURL(new RegExp(`/${locale}$`));
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
  for (const locale of LOCALES) {
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

  // …and the same page, hydrated, is a working app.
  await open(page, "/uk");
  await page.getByTestId("cart-inc").click();
  await expect(page.getByTestId("cart")).toHaveText(plural("uk", "cart.items", 3));
  await switchTo(page, "de");
});

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
