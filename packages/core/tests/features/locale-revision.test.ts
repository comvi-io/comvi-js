import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";

/**
 * `localeRevision`: a count of the instance's real locale changes, for
 * bindings that must notice a move even when the locale ends where it began.
 */
describe("localeRevision", () => {
  it("increments exactly once per real locale change", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    expect(i18n.localeRevision).toBe(0);

    await i18n.setLocale("uk");
    expect(i18n.localeRevision).toBe(1);
    // Away and back is two changes, though the locale is where it started.
    await i18n.setLocale("en");
    expect(i18n.localeRevision).toBe(2);
    i18n.locale = "de";
    expect(i18n.localeRevision).toBe(3);
  });

  it("has already moved when a localeChanged listener runs", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const seen: number[] = [];
    i18n.on("localeChanged", () => seen.push(i18n.localeRevision));

    await i18n.setLocale("uk");

    expect(seen).toEqual([1]);
  });

  it("does not move on setLocale to the current locale", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    await i18n.setLocale("en");
    i18n.locale = "en";

    expect(i18n.localeRevision).toBe(0);
  });

  /** A loader-backed instance with one active namespace, so a switch awaits its catalog. */
  const loaderBacked = async () => {
    const answers: Record<string, { resolve: () => void; reject: () => void }> = {};
    const i18n = attachLoader(
      createI18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} }),
    );
    i18n.registerLoader((locale) =>
      locale === "en"
        ? Promise.resolve({ greeting: "en" })
        : new Promise((resolve, reject) => {
            answers[locale] = {
              resolve: () => resolve({ greeting: locale }),
              reject: () => reject(new Error(`no ${locale}`)),
            };
          }),
    );
    await i18n.addActiveNamespace("common");
    return { i18n, answers };
  };

  it("moves when a loader-backed setLocale assigns, not when it is requested", async () => {
    const { i18n, answers } = await loaderBacked();

    const switching = i18n.setLocale("uk");
    await Promise.resolve();
    expect(i18n.localeRevision).toBe(0);
    answers.uk.resolve();
    await switching;

    expect(i18n.locale).toBe("uk");
    expect(i18n.localeRevision).toBe(1);
  });

  it("does not move for a failed or a superseded setLocale that never assigns", async () => {
    const { i18n, answers } = await loaderBacked();

    const failing = i18n.setLocale("fr");
    await Promise.resolve();
    answers.fr.reject();
    await expect(failing).rejects.toThrow();
    expect(i18n.locale).toBe("en");
    expect(i18n.localeRevision).toBe(0);

    // `uk` is superseded by `de` before its catalog arrives: only `de` assigns.
    const superseded = i18n.setLocale("uk");
    const latest = i18n.setLocale("de");
    await Promise.resolve();
    answers.uk.resolve();
    await superseded;
    expect(i18n.locale).toBe("en");
    expect(i18n.localeRevision).toBe(0);
    answers.de.resolve();
    await latest;

    expect(i18n.locale).toBe("de");
    expect(i18n.localeRevision).toBe(1);
  });

  it("is untouched by a withMessages view", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hello" } },
      exposeGlobal: false,
    });
    const view = i18n.withMessages({ "de:default": { greeting: "Hallo" } });

    view.t("greeting", { locale: "de" });
    view.t("absent");
    view.hasTranslation("greeting", "de");

    expect(i18n.localeRevision).toBe(0);
    expect((view as unknown as Record<string, unknown>).localeRevision).toBeUndefined();
  });
});
