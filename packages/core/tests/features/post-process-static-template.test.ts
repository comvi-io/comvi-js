import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import type { TranslationResult } from "../../src";

const shout = (result: TranslationResult): TranslationResult =>
  typeof result === "string" ? result.toUpperCase() : result;

describe("postProcess", () => {
  // A placeholder-free template is marked static by its FIRST render, which arms the
  // paramless fast path in tRaw(); that fast path must still not skip post-processing.
  it("applies to a placeholder-free template on a repeated paramless render", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" } },
      postProcess: shout,
    });
    i18n.t("greeting" as never);

    const repeated = i18n.t("greeting" as never);

    expect(repeated).toBe("HELLO");
  });
});
