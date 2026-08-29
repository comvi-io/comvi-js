import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Split out of `compiler-policy.dist.test.ts`: importing the built tags entry
 * registers the `<` grammar AMBIENTLY into the prod core module, and that
 * registration is process-global and retroactive. Vitest gives every FILE a
 * fresh module registry, so isolating this case is what keeps the sibling
 * suite's claims independent of test order instead of load-bearing on it.
 *
 * Requires a fresh build.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

beforeAll(() => {
  if (!fs.existsSync(path.join(DIST, "comvi-core-tags.js"))) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
  }
});

describe("prod dist: the ICU literal with @comvi/core/tags loaded", () => {
  it("keeps the braces literal even with @comvi/core/tags loaded — no tag parsing inside", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    await import("../../dist/comvi-core-tags.js");
    const template = "{count, plural, one {<b>#</b> tagged} other {<b>#</b> taggeds}}";

    const reports: Array<{ argumentType?: unknown }> = [];
    const i18n = createI18n({
      locale: "en",
      translation: { en: { tagged: template } },
      onError: (error: Error) => void reports.push(error),
    });

    // ONE raw text token for the whole balanced group: the `<b>` inside is never
    // re-parsed by the tags extension, so nothing renders and nothing is dropped.
    expect(i18n.t("tagged", { count: 2 })).toBe(template);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.argumentType).toBe("plural");
  });

  it("still parses tags outside an ICU argument, so the claim above is not vacuous", async () => {
    const { createI18n } = await import("../../dist/comvi-core.js");
    await import("../../dist/comvi-core-tags.js");

    const tagged = createI18n({ locale: "en", translation: { en: { m: "a <b>b</b> c" } } });

    expect(tagged.t("m", { b: () => "B" })).toBe("a B c");
  });
});
