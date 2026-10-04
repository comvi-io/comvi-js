// @vitest-environment node
/**
 * The README quick start (`check=group=quick-start-next-1`), RUN.
 *
 * `check=group=…` lints the fences for imports and composition, and
 * `pnpm check:snippets` type-checks them, but neither executes one. Defects
 * this file exists for passed every one of those gates:
 * - a catalog shaped `{ en: { default: { greeting } } }` defined the key
 *   `default.greeting`, so `t("greeting")` rendered the literal key;
 * - a page fence that called `await getI18n()` with no locale and no
 *   `setRequestLocale(locale)` of its own served `/en` and `/uk` as HTTP 500
 *   ("[comvi/next] Locale not set…"). Observed on next@15.5.9 and
 *   next@16.3.5 with the fences extracted verbatim into an app, the layout's
 *   own call directly above. React can render the page before the layout has
 *   set the locale, so the page passes it: `getI18n({ locale })`.
 *
 * The setup has no registration module: `withComvi({ config })` aliases
 * `@comvi/next/config` to the config fence's module, which only a bundled Next
 * graph applies. Here `vi.doMock` stands in for that alias, built from the
 * fences themselves.
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

const NEXT_CONFIG = readFence("ts", "next.config.ts");
const ROUTING = readFence("ts", "src/i18n/routing.ts");
const CONFIG = readFence("ts", "src/i18n/config.ts");
const LAYOUT = readFence("tsx", "src/app/[locale]/layout.tsx");
const PAGE = readFence("tsx", "src/app/[locale]/page.tsx");

/** Every fence of the group, in README order: the whole app. */
const GROUP_TITLES = [
  ...README.matchAll(new RegExp(`\`\`\`\\w+ title="([^"]+)" ${GROUP}`, "g")),
].map((m) => m[1]);

/**
 * The first balanced `{…}` after `marker`, evaluated with `scope` in reach.
 * Brace matching rather than a parser: the README's literals hold only string,
 * array and object values, plus a spread of the routing object.
 */
function evalObjectAfter(
  code: string,
  marker: string,
  scope: Record<string, unknown> = {},
): Record<string, unknown> {
  const at = code.indexOf(marker);
  if (at === -1) throw new Error(`fence has no \`${marker}\``);
  const open = code.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    if (code[i] === "}" && --depth === 0) {
      const names = Object.keys(scope);
      return new Function(...names, `return ${code.slice(open, i + 1)};`)(
        ...names.map((name) => scope[name]),
      ) as Record<string, unknown>;
    }
  }
  throw new Error(`the literal after \`${marker}\` is unbalanced`);
}

/** `import … from "<from>"` lines naming `binding`. */
const importsOf = (code: string, binding: string) =>
  code
    .split("\n")
    .filter((line) => line.startsWith("import ") && new RegExp(`\\b${binding}\\b`).test(line));

const README_ROUTING = evalObjectAfter(ROUTING, "defineRouting(") as {
  locales: string[];
  defaultLocale: string;
};
const README_OPTIONS = evalObjectAfter(CONFIG, "createNextI18n(", { routing: README_ROUTING });

/** Every `t("key", { … })` call in the page fence, with its params evaluated. */
const PAGE_CALLS = [...PAGE.matchAll(/\bt\("([^"]+)"(?:,\s*(\{[^}]*\}))?\)/g)].map((m) => ({
  key: m[1],
  params: m[2] === undefined ? undefined : (new Function(`return ${m[2]};`)() as object),
}));

/**
 * What the README's own fences produce for one request, on the real server
 * modules: the config fence's host behind `@comvi/next/config` (the alias
 * `withComvi` sets, or the empty stub without it), the layout's provider, then
 * the page's `getI18n({ locale })`.
 */
async function serveReadme({ withComvi }: { withComvi: boolean }, locale: string) {
  vi.resetModules();
  const { createNextI18n } = await import("../src/createNextI18n");
  const { defineRouting } = await import("../src/routing/defineRouting");
  // src/i18n/routing.ts and src/i18n/config.ts, with the README's own literals.
  const routing = defineRouting(README_ROUTING);
  const { i18n } = createNextI18n({ ...README_OPTIONS, devMode: false } as never);
  vi.doMock("@comvi/next/config", () =>
    withComvi ? { i18n, routing } : { i18n: undefined, routing: undefined },
  );
  const { ComviProvider, getI18n } = await import("../src/server");

  // src/app/[locale]/layout.tsx: `<ComviProvider locale={locale}>`.
  const layout = (await ComviProvider({ locale, children: null })) as {
    props: { messages: Record<string, Record<string, string>> };
  };
  // src/app/[locale]/page.tsx: `const { t } = await getI18n({ locale });`.
  const { t } = await getI18n({ locale });
  return {
    page: PAGE_CALLS.map(({ key, params }) =>
      (t as (k: string, p?: object) => string)(key, params),
    ),
    messages: layout.props.messages,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.doUnmock("@comvi/next/config");
});

describe("the README quick start, run on the server modules", () => {
  it("is exactly five files: next.config, routing, config, layout and page", () => {
    expect(GROUP_TITLES).toEqual([
      "next.config.ts",
      "src/i18n/routing.ts",
      "src/i18n/config.ts",
      "src/app/[locale]/layout.tsx",
      "src/app/[locale]/page.tsx",
    ]);
  });

  it("the page fence asks for at least one key", () => {
    expect(PAGE_CALLS.length).toBeGreaterThan(0);
  });

  it("renders every key the page asks for, in every locale the routing declares", async () => {
    expect(README_ROUTING.locales).toEqual(["en", "uk"]);
    expect((await serveReadme({ withComvi: true }, "en")).page).toEqual(["Hello, Alice!"]);
    expect((await serveReadme({ withComvi: true }, "uk")).page).toEqual(["Привіт, Alice!"]);
  });

  it("the layout's provider hands the client the request locale's catalog", async () => {
    const { messages } = await serveReadme({ withComvi: true }, "uk");
    expect(messages["uk:default"]).toEqual({ greeting: "Привіт, {name}!" });
  });

  it("defines the keys at the top level, not under a namespace segment", async () => {
    const { createNextI18n } = await import("../src/createNextI18n");
    const { i18n } = createNextI18n({ ...README_OPTIONS, devMode: false } as never);
    for (const { key } of PAGE_CALLS) {
      for (const locale of README_ROUTING.locales) {
        expect(i18n.hasTranslation(key as never, locale)).toBe(true);
        expect(i18n.hasTranslation(`default.${key}` as never, locale)).toBe(false);
      }
    }
  });

  it("rejects without withComvi — why next.config.ts is part of the setup", async () => {
    // The layout's provider is the first to need the config module.
    await expect(serveReadme({ withComvi: false }, "en")).rejects.toThrow(
      "[comvi/next] <ComviProvider> needs withComvi({ config }) in next.config",
    );
  });
});

describe("next.config.ts", () => {
  it("points withComvi at the config fence's file", () => {
    expect(importsOf(NEXT_CONFIG, "withComvi")).toEqual([
      'import { withComvi } from "@comvi/next/plugin";',
    ]);
    expect(NEXT_CONFIG).toContain('withComvi({ config: "./src/i18n/config.ts" })');
  });
});

describe("src/i18n/config.ts", () => {
  it("exports i18n and routing, the names the library reads", () => {
    expect(CONFIG).toContain("export const { i18n } = createNextI18n({");
    expect(CONFIG).toContain("export { routing };");
    expect(importsOf(CONFIG, "routing")).toEqual(['import { routing } from "./routing";']);
  });

  it("carries no server-only marker: it is evaluated by both builds", () => {
    for (const fence of [NEXT_CONFIG, ROUTING, CONFIG, LAYOUT, PAGE]) {
      expect(fence).not.toContain("server-only");
    }
  });
});

describe("src/app/[locale]/layout.tsx", () => {
  it("renders <ComviProvider locale> from @comvi/next/server, with no wrapper of its own", () => {
    expect(importsOf(LAYOUT, "ComviProvider")).toEqual([
      'import { ComviProvider } from "@comvi/next/server";',
    ]);
    expect(LAYOUT).toContain("<ComviProvider locale={locale}>{children}</ComviProvider>");
    expect(LAYOUT).not.toContain("use client");
    expect(LAYOUT).not.toContain("setRequestLocale");
  });

  it("returns 404 for a locale the routing does not declare", () => {
    expect(LAYOUT).toContain("if (!hasLocale(routing.locales, locale)) notFound();");
    expect(importsOf(LAYOUT, "routing")).toContain('import { routing } from "@/i18n/routing";');
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
