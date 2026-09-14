/**
 * The README's inline quickstart catalog, RUN.
 *
 * `check=group=…` lints the fences for imports and composition, and
 * `pnpm check:snippets` type-checks them, but neither executes one — so
 * `translation: { en: { default: { greeting } } }` passed every gate while
 * defining the key `default.greeting`: a colon-less top-level key is the
 * LOCALE alone, and its object is flattened into the default namespace, so
 * `t("greeting")` rendered the literal key.
 *
 * This reads the catalog out of the README fence itself rather than restating
 * it, so the day the shape drifts back the test goes red instead of agreeing
 * with a copy of its own.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { icuCompiler } from "@comvi/core/icu";
import { createNextI18n } from "../src/createNextI18n";

const README = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..", "README.md");
const FENCE = '```ts title="src/i18n.ts" check=group=next-quickstart-inline';
const LAYOUT_FENCE =
  '```tsx title="src/app/[locale]/layout.tsx" check=group=next-quickstart-inline';

/** The named fence's code, without its info string or closing fence. */
function readFence(source: string, opening: string): string {
  const start = source.indexOf(opening);
  if (start === -1) throw new Error(`README has no fence opening with: ${opening}`);
  const bodyStart = source.indexOf("\n", start) + 1;
  const end = source.indexOf("\n```", bodyStart);
  if (end === -1) throw new Error(`fence is never closed: ${opening}`);
  return source.slice(bodyStart, end);
}

/**
 * The `translation: { … }` object literal of that fence, evaluated. Brace
 * matching rather than a parser: the value is a literal with string values,
 * so the first balanced `{…}` after the key IS the catalog.
 */
function readTranslationOption(code: string): Record<string, Record<string, string>> {
  const key = code.indexOf("translation:");
  if (key === -1) throw new Error("the quickstart fence has no `translation:` option");
  const open = code.indexOf("{", key);
  let depth = 0;
  let close = -1;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) throw new Error("the `translation:` literal is unbalanced");
  return new Function(`return ${code.slice(open, close + 1)};`)() as Record<
    string,
    Record<string, string>
  >;
}

describe("the README's inline quickstart catalog", () => {
  const translation = readTranslationOption(readFence(fs.readFileSync(README, "utf8"), FENCE));

  it("resolves the keys the quickstart's own components ask for", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "uk"],
      defaultLocale: "en",
      compiler: icuCompiler,
      translation,
      devMode: false,
    });

    // `src/app/[locale]/page.tsx` and `Greeting.tsx` in the same fence group.
    expect(i18n.t("greeting" as never, { name: "Server" } as never)).toBe("Hello, Server!");
    expect(i18n.t("items" as never, { count: 3 } as never)).toBe("3 items");

    // The other locale of the same fence, through the same lookup.
    i18n.locale = "uk";
    expect(i18n.t("greeting" as never, { name: "Сервер" } as never)).toBe("Привіт, Сервер!");
    expect(i18n.t("items" as never, { count: 3 } as never)).toBe("3 товари");
  });

  it("defines the keys at the top level, not under a namespace segment", () => {
    const { i18n } = createNextI18n({
      locales: ["en", "uk"],
      defaultLocale: "en",
      compiler: icuCompiler,
      translation,
      devMode: false,
    });

    expect(i18n.hasTranslation("greeting", "en")).toBe(true);
    expect(i18n.hasTranslation("default.greeting", "en")).toBe(false);
  });
});

describe("the README's inline quickstart layout", () => {
  const layout = readFence(fs.readFileSync(README, "utf8"), LAYOUT_FENCE);

  it("calls setRequestLocale(locale) before it renders the provider", () => {
    // Without this the quickstart THROWS on first render: `getI18n()` in the
    // page fence reads the request locale from React's per-request cache, which
    // step 1 has no middleware to fill, so `setRequestLocale` is the only thing
    // that fills it. The README shipped without the call from wave 4 to wave 5,
    // and no gate could see it — `pnpm check:snippets` resolves imports and
    // type-checks, and this fence was valid TypeScript throughout.
    const call = layout.indexOf("setRequestLocale(locale)");
    const provider = layout.indexOf("<I18nClientProvider");

    expect(call).toBeGreaterThan(-1);
    expect(provider).toBeGreaterThan(-1);
    expect(call).toBeLessThan(provider);
  });

  it("imports setRequestLocale from a real entry point", () => {
    // The name has to come from somewhere a reader can copy. `@comvi/next/server`
    // is where it lives; step 2's layout takes it through the app's own
    // "server-only" re-export module instead, which is the shape
    // examples/next uses.
    const importLine = layout
      .split("\n")
      .find((line) => line.includes("setRequestLocale") && line.startsWith("import "));

    expect(importLine).toBeDefined();
    expect(importLine).toContain('from "@comvi/next/server"');
  });
});
