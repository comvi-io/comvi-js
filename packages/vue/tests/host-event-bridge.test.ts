/**
 * The wrapper's event→reactivity bridge, one revision event at a time.
 *
 * A real host is used, but its `on` is replaced so the test — not the host —
 * decides when each revision event reaches the wrapper. That is the only way
 * to see what a SINGLE event resyncs: driving the host normally emits several
 * at once, and the later ones mask what the earlier ones did.
 *
 * Every claim is made through a WATCHER collecting values over time, never a
 * bare `.value` read after the fact: a passive read of a computed can pick the
 * host's new state up on access, which would hide a bridge that never fired.
 */
import { describe, it, expect, vi } from "vitest";
import { nextTick, watch } from "vue";
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
    const localeSeen: string[] = [];
    const loadedSeen: string[][] = [];
    watch(i18n.locale, (locale) => localeSeen.push(locale));
    watch(i18n.loadedLocales, (locales) => loadedSeen.push([...locales]));

    host.addTranslations({ "fr:common": { hello: "Bonjour" } });
    await host.setLocaleAsync("fr");
    await nextTick();

    expect(localeSeen).toEqual([]);
    expect(loadedSeen).toEqual([]);

    emit("initialized");
    await nextTick();

    expect(localeSeen).toEqual(["fr"]);
    expect(loadedSeen).toEqual([["fr"]]);
  });

  it("resyncs the cache when the host reports a default-namespace change", async () => {
    const { host, i18n, emit } = createReplayHost();
    const loadedSeen: string[][] = [];
    watch(i18n.loadedLocales, (locales) => loadedSeen.push([...locales]));

    host.addTranslations({ "de:common": { hello: "Hallo" } });
    await nextTick();

    expect(loadedSeen).toEqual([]);

    emit("defaultNamespaceChanged");
    await nextTick();

    expect(loadedSeen).toEqual([["de"]]);
  });

  it("leaves the locale ref alone when the host reports only a loading-state change", async () => {
    const { host, i18n, emit } = createReplayHost();
    const localeSeen: string[] = [];
    watch(i18n.locale, (locale) => localeSeen.push(locale));

    await host.setLocaleAsync("fr");
    emit("loadingStateChanged");
    await nextTick();

    expect(localeSeen).toEqual([]);
  });

  it("does not ask the host to change to the locale it already has", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const changeHostLocale = vi.spyOn(i18n.core, "setLocaleAsync");

    await i18n.setLocale("en");

    expect(changeHostLocale).not.toHaveBeenCalled();
  });
});
