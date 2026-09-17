import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACCEPT_LANGUAGE_CASES } from "@comvi/test-utils/acceptLanguageTable";
import { resolveAcceptLanguage } from "../src/runtime/utils/resolve-locale";

/**
 * Half of the Next/Nuxt Accept-Language contract: the same table
 * `packages/next/tests/accept-language-parity.test.ts` runs through next's
 * middleware, run here through nuxt's public resolver. See
 * `docs/design/next-nuxt-parity.md`.
 */
describe("nuxt resolves the shared Accept-Language table", () => {
  for (const { header, locales, expected, why } of ACCEPT_LANGUAGE_CASES) {
    it(`${JSON.stringify(header)} over ${JSON.stringify(locales)} → ${String(expected)} — ${why}`, () => {
      expect(resolveAcceptLanguage(header, locales)).toBe(expected);
    });
  }
});

/**
 * The table above passes whether the semantics live in one file or two — it
 * passed while next and nuxt each had their own copy. This is the part that
 * does not: nuxt's resolver must BE the shared one, reached through the
 * vendored copy that `tests/vendor-parity.test.ts` pins byte-for-byte to
 * `packages/locale-routing/src/index.ts`.
 */
describe("nuxt has no Accept-Language parser of its own", () => {
  const source = readFileSync(resolve(__dirname, "../src/runtime/utils/resolve-locale.ts"), "utf8");

  it("re-exports the resolver from the vendored shared source", () => {
    expect(source).toContain("../_vendor/locale-routing");
    expect(source).toContain("resolveAcceptLanguage");
  });

  it("parses nothing locally: no q-value arithmetic in this package", () => {
    // The two markers of the deleted local copy. If either comes back, the
    // package has a second implementation to keep in step again.
    expect(source).not.toContain("parseFloat");
    expect(source).not.toContain("q=1");
  });
});
