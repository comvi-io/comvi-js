/**
 * Production fail-soft for the exact-plural-selector check added in RC review
 * #6. Development throws `E_ICU_SYNTAX` at ingestion for `=abc`; production
 * renders the braced segment verbatim and reports the argument type once,
 * exactly as it does for every other argument this compiler cannot compile.
 */
import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import type { ErrorReportContext } from "../../src/types";

const BAD = "{n, plural, =abc {exact} other {other}}";

function icuHost(template: string) {
  const reports: Array<{ error: Error; context?: ErrorReportContext }> = [];
  const i18n = createI18n({
    locale: "en",
    exposeGlobal: false,
    compiler: icuCompiler,
    messages: { en: { k: template } },
    onError: (error, context) => void reports.push({ error, context }),
  });
  return { i18n, reports };
}

describe("a non-numeric exact plural selector in production", () => {
  it("renders the argument verbatim rather than choosing another branch", () => {
    const { i18n } = icuHost(BAD);

    expect(i18n.t("k", { n: 1 })).toBe(BAD);
  });

  it("reports E_ICU_SYNTAX naming plural as the argument type", () => {
    const { i18n, reports } = icuHost(BAD);

    i18n.t("k", { n: 1 });

    expect(reports).toHaveLength(1);
    expect(reports[0]!.error.message).toBe("E_ICU_SYNTAX");
    expect((reports[0]!.error as { argumentType?: unknown }).argumentType).toBe("plural");
  });

  it("still renders a valid canonical-equivalent selector", () => {
    const { i18n } = icuHost("{n, plural, =1.0 {exact} other {other}}");

    expect(i18n.t("k", { n: 1 })).toBe("exact");
  });
});
