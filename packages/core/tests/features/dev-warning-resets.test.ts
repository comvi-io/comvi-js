import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { clearTemplateCache, _resetMissingParamWarnings } from "../../src/core/translate";
import { _resetTagWarnings } from "../../src/core/translate/parser";

// Both dev warnings dedup for the lifetime of the module, so `tests/setup.ts` calls these
// seams in afterEach. What they must actually forget is pinned here, from inside one test.

function warnings(spy: ReturnType<typeof vi.spyOn>, fragment: string): string[] {
  return spy.mock.calls
    .map((call) => call[0])
    .filter(
      (message): message is string => typeof message === "string" && message.includes(fragment),
    );
}

describe("_resetMissingParamWarnings()", () => {
  it("makes the same (template, param) pair warn again on the next render", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en", translation: { en: { greet: "Hi {name}" } } });
    i18n.t("greet" as never);

    _resetMissingParamWarnings();
    i18n.t("greet" as never);

    expect(warnings(warnSpy, "Missing parameter")).toEqual([
      '[i18n] Missing parameter "name" for template "Hi {name}"',
      '[i18n] Missing parameter "name" for template "Hi {name}"',
    ]);
  });

  it("leaves the pair deduped when it is not called", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en", translation: { en: { greet: "Hi {name}" } } });

    i18n.t("greet" as never);
    i18n.t("greet" as never);

    expect(warnings(warnSpy, "Missing parameter")).toEqual([
      '[i18n] Missing parameter "name" for template "Hi {name}"',
    ]);
  });
});

describe("_resetTagWarnings()", () => {
  // The warning is raised by the parse, so a re-render only reaches it once the template
  // cache has been cleared too — that is why both seams are called before the second render.
  it("makes the same template warn again on the next parse", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en", translation: { en: { link: "click <b>here</b>" } } });
    i18n.t("link" as never);

    clearTemplateCache();
    _resetTagWarnings();
    i18n.t("link" as never);

    expect(warnings(warnSpy, "is rendering as literal text")).toHaveLength(2);
  });

  it("leaves the template deduped when it is not called", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en", translation: { en: { link: "click <b>here</b>" } } });
    i18n.t("link" as never);

    clearTemplateCache();
    i18n.t("link" as never);

    expect(warnings(warnSpy, "is rendering as literal text")).toHaveLength(1);
  });
});
