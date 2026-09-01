/**
 * The wrapper's event→reactivity bridge, one revision event at a time.
 *
 * A real host is used, but its `on` is replaced so the test — not the host —
 * decides when each revision event reaches the wrapper. That is the only way
 * to see what a SINGLE event resyncs: driving the host normally emits several
 * at once, and the later ones mask what the earlier ones did.
 */
import { describe, it, expect, vi } from "vitest";
import { createCore, createI18n, createI18nFromCore } from "../src";
import type { I18nEvent } from "../src";

const createReplayHost = () => {
  const host = createCore({ locale: "en", defaultNs: "common" });
  const handlers = new Map<string, () => void>();
  vi.spyOn(host, "on").mockImplementation(((event: I18nEvent, callback: () => void) => {
    handlers.set(event, callback);
    return () => handlers.delete(event);
  }) as typeof host.on);

  return {
    host,
    i18n: createI18nFromCore(host),
    emit: (event: I18nEvent) => handlers.get(event)?.(),
  };
};

describe("VueI18n host event bridge", () => {
  it("resyncs the locale ref and the cache when the host reports it is initialized", async () => {
    const { host, i18n, emit } = createReplayHost();
    // Read once up front: a computed nobody has evaluated yet cannot be stale.
    const loadedLocales = i18n.loadedLocales;
    expect(loadedLocales.value).toEqual([]);

    host.addTranslations({ "fr:common": { hello: "Bonjour" } });
    await host.setLocaleAsync("fr");

    expect(i18n.locale.value).toBe("en");
    expect(loadedLocales.value).toEqual([]);

    emit("initialized");

    expect(i18n.locale.value).toBe("fr");
    expect(loadedLocales.value).toEqual(["fr"]);
  });

  it("resyncs the cache when the host reports a default-namespace change", () => {
    const { host, i18n, emit } = createReplayHost();
    const loadedLocales = i18n.loadedLocales;
    expect(loadedLocales.value).toEqual([]);

    host.addTranslations({ "de:common": { hello: "Hallo" } });

    expect(loadedLocales.value).toEqual([]);

    emit("defaultNamespaceChanged");

    expect(loadedLocales.value).toEqual(["de"]);
  });

  it("leaves the locale ref alone when the host reports only a loading-state change", async () => {
    const { host, i18n, emit } = createReplayHost();
    await host.setLocaleAsync("fr");

    emit("loadingStateChanged");

    expect(i18n.locale.value).toBe("en");
  });

  it("does not ask the host to change to the locale it already has", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const changeHostLocale = vi.spyOn(i18n.core, "setLocaleAsync");

    await i18n.setLocale("en");

    expect(changeHostLocale).not.toHaveBeenCalled();
  });
});
