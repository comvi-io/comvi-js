import { describe, it, expect } from "vitest";
// The COMPOSITE host (`src/core/full.ts`), imported directly as locale-race does.
import { I18n } from "../../src/core/full";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";

/**
 * A loader-backed `setLocale()` whose target needs no load — every active
 * namespace of it is cached — switches inside the call. One that must fetch
 * stays the asynchronous, loading-bracketed switch.
 */
const OPTIONS = { locale: "en", ns: [], exposeGlobal: false, onError: () => {} };

describe.each([
  ["composed host", () => new I18n(OPTIONS)],
  ["slim + attachLoader", () => attachLoader(createI18n(OPTIONS))],
] as const)("loader setLocale() on a cached target (%s)", (_label, make) => {
  const trace = (i18n: ReturnType<typeof make>) => {
    const events: string[] = [];
    i18n.on("localeChanged", ({ from, to }) => events.push(`locale ${from}>${to}`));
    i18n.on("loadingStateChanged", ({ isLoading }) => events.push(`loading ${isLoading}`));
    return events;
  };

  const setup = async (cached: Record<string, Record<string, string>> = {}) => {
    const answers: Record<string, () => void> = {};
    const requested: string[] = [];
    const i18n = make();
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
    return { i18n, answers, requested, events: trace(i18n) };
  };

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

  it("a cached switch followed at once by one that must fetch ends at the fetched target", async () => {
    const { i18n, answers, requested, events } = await setup({ uk: { greeting: "Привіт" } });

    const toUk = i18n.setLocale("uk");
    const toFr = i18n.setLocale("fr");

    expect(i18n.locale).toBe("uk");
    expect(events).toEqual(["locale en>uk", "loading true"]);
    await Promise.resolve();
    answers.fr();
    await Promise.all([toUk, toFr]);

    expect(requested).toEqual(["fr"]);
    expect(i18n.locale).toBe("fr");
    expect(i18n.localeRevision).toBe(2);
    expect(i18n.isLoading).toBe(false);
    expect(events).toEqual(["locale en>uk", "loading true", "locale uk>fr", "loading false"]);
  });

  it("keeps the loading pair when no loader is registered at all", async () => {
    const i18n = make();
    const events = trace(i18n);

    const switching = i18n.setLocale("uk");

    // As synchronous as a cache hit; the pair is the capability's old contract.
    expect(i18n.locale).toBe("uk");
    await switching;
    expect(events).toEqual(["loading true", "locale en>uk", "loading false"]);
  });

  it("re-entrant: a listener's switch lands, and its nested event reaches later listeners before the outer one", async () => {
    const { i18n } = await setup({ uk: { greeting: "Привіт" }, de: { greeting: "Hallo" } });
    i18n.on("localeChanged", ({ to }) => {
      if (to === "uk") void i18n.setLocale("de");
    });
    // Registered second: what a later listener (a binding, say) is delivered.
    const delivered: string[] = [];
    i18n.on("localeChanged", ({ from, to }) =>
      delivered.push(`${from}>${to} at ${i18n.locale}#${i18n.localeRevision}`),
    );

    await i18n.setLocale("uk");

    expect(i18n.locale).toBe("de");
    expect(i18n.localeRevision).toBe(2);
    // The payloads arrive out of order; `i18n.locale` read in the listener is right both times.
    expect(delivered).toEqual(["uk>de at de#2", "en>uk at de#2"]);
  });
});
