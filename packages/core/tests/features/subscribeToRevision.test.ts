import { describe, expect, it } from "vitest";
import {
  subscribeToRevision,
  REVISION_EVENTS,
  type RevisionEvent,
  createI18n,
} from "../../src/index";
import type { I18nEvent } from "../../src/types";

const realInstance = async () => {
  const i18n = createI18n({
    locale: "en",
    defaultNs: "common",
    translation: { en: { hello: "Hello" }, fr: { hello: "Bonjour" } },
  });
  await i18n.init();
  return i18n;
};

describe("subscribeToRevision", () => {
  it("covers the canonical 7-event set", () => {
    expect(REVISION_EVENTS).toHaveLength(7);
    expect([...REVISION_EVENTS].sort()).toEqual([
      "configChanged",
      "defaultNamespaceChanged",
      "initialized",
      "loadingStateChanged",
      "localeChanged",
      "namespaceLoaded",
      "translationsCleared",
    ]);
  });

  it("subscribes the callback to every canonical event and forwards each event name", () => {
    const subscribed: I18nEvent[] = [];
    const received: RevisionEvent[] = [];
    const handlers = new Map<I18nEvent, () => void>();

    const source = {
      on(event: I18nEvent, callback: (data: never) => void) {
        subscribed.push(event);
        handlers.set(event, callback as () => void);
        return () => handlers.delete(event);
      },
    };

    subscribeToRevision(source, (event) => received.push(event));

    expect([...subscribed].sort()).toEqual([...REVISION_EVENTS].sort());

    for (const event of REVISION_EVENTS) handlers.get(event)?.();
    expect([...received].sort()).toEqual([...REVISION_EVENTS].sort());
  });

  it("the disposer removes every subscription", () => {
    let active = 0;
    const source = {
      on(_event: I18nEvent, _callback: (data: never) => void) {
        active++;
        return () => {
          active--;
        };
      },
    };

    const unsubscribe = subscribeToRevision(source, () => {});
    expect(active).toBe(REVISION_EVENTS.length);
    unsubscribe();
    expect(active).toBe(0);
  });

  it("fires against a real instance on locale and config changes", async () => {
    const i18n = await realInstance();

    const received: RevisionEvent[] = [];
    subscribeToRevision(i18n, (event) => received.push(event));

    await i18n.setLocaleAsync("fr");

    expect(received).toEqual(["localeChanged"]);

    i18n.setFallbackLocale("en");

    expect(received).toEqual(["localeChanged", "configChanged"]);
  });

  it("the disposer stops delivery from a real instance", async () => {
    const i18n = await realInstance();

    const received: RevisionEvent[] = [];
    const unsubscribe = subscribeToRevision(i18n, (event) => received.push(event));

    unsubscribe();
    await i18n.setLocaleAsync("fr");

    expect(received).toEqual([]);
  });
});
