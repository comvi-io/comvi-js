import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";

/**
 * A loader-backed `setLocale()` whose target needs no load — every active
 * namespace of it is cached — switches inside the call. One that must fetch
 * stays the asynchronous, loading-bracketed switch.
 */
const setup = async (cached: Record<string, Record<string, string>> = {}) => {
  const answers: Record<string, () => void> = {};
  const requested: string[] = [];
  const i18n = attachLoader(
    createI18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} }),
  );
  i18n.registerLoader((locale) => {
    requested.push(locale);
    return locale === "en"
      ? Promise.resolve({ greeting: "en" })
      : new Promise((resolve) => (answers[locale] = () => resolve({ greeting: locale })));
  });
  await i18n.addActiveNamespace("common");
  for (const locale of Object.keys(cached)) {
    i18n.addMessages({ [`${locale}:common`]: cached[locale] });
  }
  requested.length = 0;
  const events: string[] = [];
  i18n.on("localeChanged", ({ from, to }) => events.push(`locale ${from}>${to}`));
  i18n.on("loadingStateChanged", ({ isLoading }) => events.push(`loading ${isLoading}`));
  return { i18n, answers, requested, events };
};

describe("loader setLocale() on a cached target", () => {
  it("switches inside the call: no load, no loading state, one localeChanged", async () => {
    const { i18n, requested, events } = await setup({ uk: { greeting: "Привіт" } });

    const switching = i18n.setLocale("uk");

    expect(i18n.locale).toBe("uk");
    expect(i18n.localeRevision).toBe(1);
    expect(i18n.isLoading).toBe(false);
    expect(events).toEqual(["locale en>uk"]);
    await expect(switching).resolves.toBeUndefined();
    expect(events).toEqual(["locale en>uk"]);
    expect(requested).toEqual([]);
    expect(i18n.t("greeting", { ns: "common" })).toBe("Привіт");
  });

  it("the locale setter switches at once too", async () => {
    const { i18n } = await setup({ uk: { greeting: "Привіт" } });

    i18n.locale = "uk";

    expect(i18n.locale).toBe("uk");
  });

  it("stays asynchronous and loading-bracketed when the target must be fetched", async () => {
    const { i18n, answers, requested, events } = await setup();

    const switching = i18n.setLocale("uk");

    expect(i18n.locale).toBe("en");
    expect(i18n.isLoading).toBe(true);
    expect(events).toEqual(["loading true"]);
    await Promise.resolve();
    answers.uk();
    await switching;

    expect(requested).toEqual(["uk"]);
    expect(i18n.locale).toBe("uk");
    expect(events).toEqual(["loading true", "locale en>uk", "loading false"]);
    expect(i18n.localeRevision).toBe(1);
  });

  it("fetches when only some active namespaces of the target are cached", async () => {
    const { i18n, answers, requested } = await setup({ uk: { greeting: "Привіт" } });
    const adding = i18n.addActiveNamespace("admin");
    await adding;
    requested.length = 0;

    const switching = i18n.setLocale("uk");

    expect(i18n.locale).toBe("en");
    await Promise.resolve();
    answers.uk();
    await switching;
    expect(requested).toEqual(["uk"]);
    expect(i18n.locale).toBe("uk");
  });

  it("supersedes an in-flight switch: its result is discarded", async () => {
    const { i18n, answers, events } = await setup({ de: { greeting: "Hallo" } });

    const toUk = i18n.setLocale("uk");
    await Promise.resolve();
    const toDe = i18n.setLocale("de");
    expect(i18n.locale).toBe("de");
    answers.uk();
    await Promise.all([toUk, toDe]);

    expect(i18n.locale).toBe("de");
    expect(i18n.localeRevision).toBe(1);
    expect(i18n.isLoading).toBe(false);
    expect(events).toEqual(["loading true", "locale en>de", "loading false"]);
  });

  it("back to the current locale mid-flight cancels the switch, with no event of its own", async () => {
    const { i18n, answers, events } = await setup();

    const toUk = i18n.setLocale("uk");
    await Promise.resolve();
    const back = i18n.setLocale("en");
    answers.uk();
    await Promise.all([toUk, back]);

    expect(i18n.locale).toBe("en");
    expect(i18n.localeRevision).toBe(0);
    expect(events).toEqual(["loading true", "loading false"]);
  });

  it("to the current locale: no event, no revision", async () => {
    const { i18n, events } = await setup();

    await i18n.setLocale("en");

    expect(events).toEqual([]);
    expect(i18n.localeRevision).toBe(0);
  });

  it("does not move a destroyed instance", async () => {
    const { i18n, events } = await setup({ uk: { greeting: "Привіт" } });
    await i18n.destroy();
    events.length = 0;

    await i18n.setLocale("uk");

    expect(i18n.locale).toBe("en");
    expect(events).toEqual([]);
  });
});
