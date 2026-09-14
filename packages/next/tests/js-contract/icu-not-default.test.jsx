// `createNextI18n` never enables ICU: the compiler is the caller's option here
// exactly as it is on `createI18n`, and this file pins the consequence against
// BOTH published core builds, because the consequence is build-dependent.
//
// Development is the loud half: the ingestion preflight throws before a single
// render, and the message names the one way to enable ICU. Production cannot
// afford that preflight, so it is the quiet half: the braced message renders
// verbatim and the host reports it once. A test that ran in only one build
// would prove half the contract and let the other half regress silently.
//
// The counterpart with the compiler named is in tests/createNextI18n.test.ts;
// here the point is the ABSENCE of the option.
import { describe, it, expect, vi } from "vitest";
import { createNextI18n } from "../../src/createNextI18n";

/* global __COMVI_CORE_BUILD__, __DEV__ */

const PLURAL = "{count, plural, one {# item} other {# items}}";

const make = (translation) =>
  createNextI18n({
    locales: ["en"],
    defaultLocale: "en",
    devMode: false,
    translation,
  });

describe(`createNextI18n without a compiler (${__COMVI_CORE_BUILD__} core build)`, () => {
  it.runIf(__DEV__)("throws E_ICU_SYNTAX at ingestion, naming the option that enables ICU", () => {
    let error;
    try {
      make({ en: { items: PLURAL } });
    } catch (thrown) {
      error = thrown;
    }

    expect(error, "expected the ingestion preflight to throw").toBeInstanceOf(Error);
    expect(error.code).toBe("E_ICU_SYNTAX");
    expect(error.argumentType).toBe("plural");
    // The message is the whole recovery path: the reader needs the option name
    // and the specifier it comes from, not just the diagnosis.
    expect(error.message).toContain('compiler: icuCompiler from "@comvi/core/icu"');
  });

  it.runIf(!__DEV__)("renders the ICU message literally and reports it once", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { i18n } = make({ en: { items: PLURAL } });

    expect(i18n.t("items", { count: 3 })).toBe(PLURAL);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[comvi] E_ICU_SYNTAX", "items", "en");
  });

  it("leaves a plain {param} catalog working in both builds", () => {
    const { i18n } = make({ en: { greeting: "Hello, {name}!" } });

    expect(i18n.t("greeting", { name: "Ada" })).toBe("Hello, Ada!");
  });
});
