/**
 * The production ICU fail-soft (D1) at SOURCE level.
 *
 * Development throws `E_ICU_SYNTAX` eagerly, at ingestion. Production cannot
 * afford that preflight, so it stays LAZY: the default compiler renders the
 * braced segment verbatim and records the argument type it saw, and the host
 * turns that record into ONE best-effort report — on the compilation that hit
 * it, never on a cached render — with the key, namespace and locale only the
 * host can supply.
 *
 * The recorded hit is process-wide, so the accounting claims below (nothing
 * leaks into the next translation, nothing crosses an instance) are the ones
 * that keep a report attributable to the call that earned it.
 *
 * THE TEMPLATE CACHE is keyed by template text, so every case uses a DISTINCT
 * one — a shared template would make the second case a cache hit that compiles,
 * and reports, nothing.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";

const PLURAL = "{count, plural, one {# item} other {# items}}";

function reportingHost(translation: Record<string, Record<string, string>>) {
  const reports: Array<{ error: Error; context?: Record<string, unknown> }> = [];
  const i18n = createI18n({
    locale: "en",
    exposeGlobal: false,
    translation,
    onError: (error, context) => void reports.push({ error, context }),
  });
  return { i18n, reports };
}

describe("an ICU argument reaching the default compiler", () => {
  it("renders the braced segment verbatim instead of throwing", () => {
    const { i18n } = reportingHost({ en: { items: PLURAL } });

    expect(i18n.t("items", { count: 2 })).toBe(PLURAL);
  });

  it("reports E_ICU_SYNTAX with the parsed argument type and the host's telemetry", () => {
    const { i18n, reports } = reportingHost({
      en: { greet: "{name, select, other {Hi}}" },
    });

    i18n.t("greet", { name: "ada" });

    expect(reports).toHaveLength(1);
    const { error, context } = reports[0]!;
    expect(error.message).toBe("E_ICU_SYNTAX");
    expect((error as { code?: unknown }).code).toBe("E_ICU_SYNTAX");
    expect((error as { argumentType?: unknown }).argumentType).toBe("select");
    expect(context).toEqual({
      source: "compile",
      key: "greet",
      namespace: "default",
      locale: "en",
    });
  });

  it("reports on the COMPILATION, so a cached re-render stays silent", () => {
    const { i18n, reports } = reportingHost({
      en: { cached: "{n, plural, one {# cached} other {# cacheds}}" },
    });

    i18n.t("cached", { n: 1 });
    i18n.t("cached", { n: 5 });

    expect(reports).toHaveLength(1);
  });

  it("falls back to a single console.error when no onError is configured", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const template = "{n, plural, one {# console} other {# consoles}}";
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { c: template } },
    });

    expect(i18n.t("c", { n: 2 })).toBe(template);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[comvi] E_ICU_SYNTAX", "c", "en");
  });

  it("writes nothing to the console when an onError handler is installed", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { i18n, reports } = reportingHost({
      en: { quiet: "{n, plural, one {# quiet} other {# quiets}}" },
    });

    i18n.t("quiet", { n: 1 });

    expect(reports).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("names the FALLBACK locale when the template only exists there", () => {
    const template = "{n, plural, one {# fallback} other {# fallbacks}}";
    const reports: Array<Record<string, unknown> | undefined> = [];
    const i18n = createI18n({
      locale: "fr",
      fallbackLocale: "en",
      exposeGlobal: false,
      translation: { en: { fb: template } },
      onError: (_error, context) => void reports.push(context),
    });

    expect(i18n.t("fb", { n: 2 })).toBe(template);

    expect(reports).toEqual([{ source: "compile", key: "fb", namespace: "default", locale: "en" }]);
  });

  it("covers a per-call `params.fallback`, which never passed through a catalog", () => {
    const template = "{n, plural, one {# fb} other {# fbs}}";
    const { i18n, reports } = reportingHost({ en: { plainKey: "Hi, {name}!" } });

    expect(i18n.t("missing", { n: 2, fallback: template })).toBe(template);

    expect(reports).toHaveLength(1);
    expect((reports[0]!.error as { argumentType?: unknown }).argumentType).toBe("plural");
    expect(reports[0]!.context).toEqual({
      source: "compile",
      key: "missing",
      namespace: "default",
      locale: "en",
    });
  });
});

describe("hit accounting", () => {
  it("stays silent for a translation that compiles cleanly", () => {
    const { i18n, reports } = reportingHost({ en: { plain: "Hi, {name}!" } });

    expect(i18n.t("plain", { name: "Ada" })).toBe("Hi, Ada!");

    expect(reports).toEqual([]);
  });

  it("stays silent for a fallback-locale lookup that compiles cleanly", () => {
    const reports: Error[] = [];
    const i18n = createI18n({
      locale: "fr",
      fallbackLocale: "en",
      exposeGlobal: false,
      translation: { en: { plain: "Hi, {name}!" } },
      onError: (error) => void reports.push(error),
    });

    expect(i18n.t("plain", { name: "Ada" })).toBe("Hi, Ada!");

    expect(reports).toEqual([]);
  });

  it("stays silent for a missing key, which compiles nothing at all", () => {
    const { i18n, reports } = reportingHost({ en: { plain: "Just text" } });

    expect(i18n.t("nope")).toBe("nope");

    expect(reports).toEqual([]);
  });

  it("does not carry a fallback compile's hit into the next translation", () => {
    const template = "{n, plural, one {# leak} other {# leaks}}";
    const { i18n, reports } = reportingHost({ en: { plainKey: "Hi, {name}!" } });

    i18n.t("missing", { n: 2, fallback: template });
    expect(i18n.t("plainKey", { name: "Ada" })).toBe("Hi, Ada!");

    expect(reports).toHaveLength(1);
  });

  it("lets a nested translation own its report instead of blaming the outer key", () => {
    const template = "{n, plural, one {# nested} other {# nesteds}}";
    const contexts: Array<Record<string, unknown> | undefined> = [];
    const i18n: ReturnType<typeof createI18n> = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { nested: template } },
      // The miss handler translates, so a whole compile-and-report cycle runs
      // INSIDE the outer lookup, before the outer call reads the pending hit.
      onMissingKey: () => i18n.t("nested", { n: 2 }),
      onError: (_error, context) => void contexts.push(context),
    });

    expect(i18n.t("absent")).toBe(template);

    expect(contexts).toEqual([
      { source: "compile", key: "nested", namespace: "default", locale: "en" },
    ]);
  });

  it("never lets one instance's pending hit surface on another", () => {
    const template = "{n, plural, one {# cross} other {# crosses}}";
    const a = reportingHost({ en: {} });
    const b = reportingHost({ en: { plain: "Just text" } });

    a.i18n.t("hit", { n: 3, fallback: template });

    expect(b.i18n.t("plain")).toBe("Just text");
    expect(b.reports).toEqual([]);
    expect(a.reports).toHaveLength(1);
  });
});
