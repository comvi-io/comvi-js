// Core's `setLocale` is synchronous when the target's catalogs are loaded, so
// a `localeChanged` listener that switches again delivers the NESTED event
// before the outer one reaches later listeners. The signal must end on the
// instance's locale, not on whichever payload arrived last.
import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { loader } from "@comvi/core/loader";
import { createI18n } from "../src";
import { createLocaleSignal } from "../src/primitives";

describe("createLocaleSignal — re-entrant setLocale", () => {
  it("ends on the instance's locale when an earlier listener switches again", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(
      loader({
        en: async () => ({ k: "en" }),
        uk: async () => ({ k: "uk" }),
        de: async () => ({ k: "de" }),
      }),
    );
    await i18n.init();
    await i18n.reloadMessages("uk");
    await i18n.reloadMessages("de");
    // Registered BEFORE the signal's own listener.
    i18n.on("localeChanged", ({ to }) => {
      if (to === "uk") void i18n.setLocale("de");
    });
    const [locale, dispose] = createRoot((d) => [createLocaleSignal(i18n), d] as const);

    await i18n.setLocale("uk");

    expect(i18n.locale).toBe("de");
    expect(locale()).toBe("de");
    dispose();
  });
});
