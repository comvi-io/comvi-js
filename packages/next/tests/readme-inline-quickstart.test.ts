// @vitest-environment node
/**
 * The README quick start (`check=group=quick-start-next-1`), RUN.
 *
 * `check=group=…` lints the fences for imports and composition, and
 * `pnpm check:snippets` type-checks them, but neither executes one. Both
 * defects this file exists for passed every one of those gates:
 * - a catalog shaped `{ en: { default: { greeting } } }` defined the key
 *   `default.greeting`, so `t("greeting")` rendered the literal key;
 * - a page fence that called `await getI18n()` with no locale and no
 *   `setRequestLocale(locale)` of its own served `/en` and `/uk` as HTTP 500
 *   ("[comvi/next] Locale not set…"). Observed on next@15.5.9 and
 *   next@16.3.5 with the four fences extracted verbatim into an app, the
 *   layout's own call directly above. React can render the page before the
 *   layout has set the locale, so the page passes it: `getI18n({ locale })`.
 *
 * Everything below is read out of the README fences rather than restated, so
 * the day the README drifts the test goes red instead of agreeing with a copy
 * of its own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

// React's `cache()` only scopes per request inside a Server Component render.
// Outside one, memoize once per module load, and reload the modules per test:
// one test is one request.
const { reactWithCache } = vi.hoisted(() => ({
  reactWithCache: async (importOriginal: () => Promise<Record<string, unknown>>) => ({
    ...(await importOriginal()),
    cache: (fn: () => unknown) => {
      let cached: unknown;
      return () => (cached ??= fn());
    },
  }),
}));
vi.mock("react", reactWithCache);
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));

const README = fs.readFileSync(
  path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..", "README.md"),
  "utf8",
);
const GROUP = "check=group=quick-start-next-1";

/** The named fence's code, without its info string or closing fence. */
function readFence(lang: "ts" | "tsx", title: string): string {
  const opening = `\`\`\`${lang} title="${title}" ${GROUP}`;
  const start = README.indexOf(opening);
  if (start === -1) throw new Error(`README has no fence opening with: ${opening}`);
  const bodyStart = README.indexOf("\n", start) + 1;
  const end = README.indexOf("\n```", bodyStart);
  if (end === -1) throw new Error(`fence is never closed: ${opening}`);
  return README.slice(bodyStart, end);
}

const CONFIG = readFence("ts", "src/i18n.ts");
const SERVER = readFence("ts", "src/i18n.server.ts");
const LAYOUT = readFence("tsx", "src/app/[locale]/layout.tsx");
const PAGE = readFence("tsx", "src/app/[locale]/page.tsx");

/**
 * The first balanced `{…}` after `marker`, evaluated. Brace matching rather
 * than a parser: the README's option and params literals hold only string,
 * array and object values.
 */
function evalObjectAfter(code: string, marker: string): Record<string, unknown> {
  const at = code.indexOf(marker);
  if (at === -1) throw new Error(`fence has no \`${marker}\``);
  const open = code.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    if (code[i] === "}" && --depth === 0) {
      return new Function(`return ${code.slice(open, i + 1)};`)() as Record<string, unknown>;
    }
  }
  throw new Error(`the literal after \`${marker}\` is unbalanced`);
}

/** `import … from "<from>"` lines naming `binding`. */
const importsOf = (code: string, binding: string) =>
  code
    .split("\n")
    .filter((line) => line.startsWith("import ") && new RegExp(`\\b${binding}\\b`).test(line));

const README_OPTIONS = evalObjectAfter(CONFIG, "createNextI18n(") as {
  locales: string[];
  defaultLocale: string;
};

/** Every `t("key", { … })` call in the page fence, with its params evaluated. */
const PAGE_CALLS = [...PAGE.matchAll(/\bt\("([^"]+)"(?:,\s*(\{[^}]*\}))?\)/g)].map((m) => ({
  key: m[1],
  params: m[2] === undefined ? undefined : (new Function(`return ${m[2]};`)() as object),
}));

/** What the README's own fences produce for one request, run on the real server modules. */
async function serveReadme({ pagePassesLocale }: { pagePassesLocale: boolean }, locale: string) {
  vi.resetModules();
  const { createNextI18n } = await import("../src/createNextI18n");
  const { setI18n, getI18n } = await import("../src/server");

  // src/i18n.ts, with the README's own options object.
  const { i18n } = createNextI18n({ ...README_OPTIONS, devMode: false } as never);
  // src/i18n.server.ts, imported by the layout for its side effect.
  setI18n(i18n);
  // src/app/[locale]/page.tsx: `const { locale } = await params; … getI18n({ locale })`.
  // The layout's `setRequestLocale` is not modelled: the page can render first.
  const { t } = await getI18n(pagePassesLocale ? { locale } : undefined);
  return PAGE_CALLS.map(({ key, params }) => (t as (k: string, p?: object) => string)(key, params));
}

beforeEach(() => {
  vi.resetModules();
});

describe("the README quick start, run on the server modules", () => {
  it("the page fence asks for at least one key", () => {
    expect(PAGE_CALLS.length).toBeGreaterThan(0);
  });

  it("renders every key the page asks for, in every locale the config declares", async () => {
    expect(README_OPTIONS.locales).toEqual(["en", "uk"]);
    expect(await serveReadme({ pagePassesLocale: true }, "en")).toEqual(["Hello, Alice!"]);
    expect(await serveReadme({ pagePassesLocale: true }, "uk")).toEqual(["Привіт, Alice!"]);
  });

  it("defines the keys at the top level, not under a namespace segment", async () => {
    const { createNextI18n } = await import("../src/createNextI18n");
    const { i18n } = createNextI18n({ ...README_OPTIONS, devMode: false } as never);
    for (const { key } of PAGE_CALLS) {
      for (const locale of README_OPTIONS.locales) {
        expect(i18n.hasTranslation(key as never, locale)).toBe(true);
        expect(i18n.hasTranslation(`default.${key}` as never, locale)).toBe(false);
      }
    }
  });

  it("rejects when the page passes no locale — why the page fence passes it", async () => {
    // Nothing else fills the request locale in this quick start: there is no
    // middleware, and the layout's call is not guaranteed to run first.
    await expect(serveReadme({ pagePassesLocale: false }, "en")).rejects.toThrow(
      "[comvi/next] Locale not set",
    );
  });
});

describe("src/i18n.server.ts", () => {
  it("registers the config module's host with setI18n", () => {
    expect(SERVER).toContain("setI18n(i18n);");
    expect(importsOf(SERVER, "setI18n")).toEqual(['import { setI18n } from "@comvi/next/server";']);
    expect(importsOf(SERVER, "i18n")).toContain('import { i18n } from "./i18n";');
  });

  it("carries no server-only marker: @comvi/next/server guards itself", () => {
    for (const fence of [CONFIG, SERVER, LAYOUT, PAGE]) {
      expect(fence).not.toContain("server-only");
    }
  });
});

describe("src/app/[locale]/layout.tsx", () => {
  it("imports the server module for its side effect", () => {
    // Without it `getI18n()` throws "i18n not configured": nothing else runs setI18n.
    expect(LAYOUT.split("\n")).toContain('import "@/i18n.server";');
  });

  it("awaits its locale param and calls setRequestLocale(locale) before it renders", () => {
    const awaited = LAYOUT.indexOf("const { locale } = await params;");
    const call = LAYOUT.indexOf("setRequestLocale(locale)");
    const render = LAYOUT.indexOf("<html");

    expect(LAYOUT).toContain("params: Promise<{ locale: string }>");
    expect(awaited).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(awaited);
    expect(render).toBeGreaterThan(call);
    expect(importsOf(LAYOUT, "setRequestLocale")).toEqual([
      'import { setRequestLocale } from "@comvi/next/server";',
    ]);
  });

  it("returns 404 for a locale the routing does not declare", () => {
    expect(LAYOUT).toContain("if (!hasLocale(routing.locales, locale)) notFound();");
  });
});

describe("src/app/[locale]/page.tsx", () => {
  it("awaits its locale param and passes it to getI18n({ locale })", () => {
    const awaited = PAGE.indexOf("const { locale } = await params;");
    const getI18n = PAGE.indexOf("await getI18n({ locale })");

    expect(PAGE).toContain("params: Promise<{ locale: string }>");
    expect(awaited).toBeGreaterThan(-1);
    expect(getI18n).toBeGreaterThan(awaited);
  });

  it("needs no setRequestLocale of its own", () => {
    expect(PAGE).not.toContain("setRequestLocale");
  });

  it("imports getI18n from @comvi/next/server", () => {
    expect(importsOf(PAGE, "getI18n")).toEqual(['import { getI18n } from "@comvi/next/server";']);
  });
});
