/**
 * What the loader's `setLocaleAsync` override decides BEFORE it awaits, and
 * how it arbitrates between requests once it has.
 *
 * Two claims the race machinery rests on and that `locale-race.test.ts` does
 * not reach: a switch that has nothing to load must not become asynchronous
 * (the `locale` setter is documented as applying synchronously whenever no
 * load stands in the way), and the changeId that suppresses a superseded
 * request must keep suppressing it after the cancelling early-exit bump — the
 * ids only ever move forward, so a stale request can never collide with a
 * later one and apply out of order.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";
import { createDeferred, type Deferred } from "../helpers/deferred";

type Catalog = Record<string, string>;

const makeHost = () => attachLoader(createI18n({ locale: "en", ns: [] }));

describe("setLocaleAsync() with a loader that has nothing to fetch", () => {
  it("applies the locale synchronously when no namespace is active", () => {
    const load = vi.fn(async () => ({}));
    const i18n = makeHost();
    i18n.registerLoader(load);

    i18n.locale = "fr";

    expect(i18n.locale).toBe("fr");
    expect(load).not.toHaveBeenCalled();
  });

  it("does not refetch a namespace the target locale already has", async () => {
    const load = vi.fn(async () => ({}));
    const i18n = makeHost();
    i18n.registerLoader(load);
    i18n.addTranslations({ en: { hi: "Hi" }, fr: { hi: "Salut" } });

    await i18n.setLocaleAsync("fr");

    expect(load).not.toHaveBeenCalled();
    expect(i18n.t("hi")).toBe("Salut");
  });
});

describe("setLocaleAsync() staleness arbitration", () => {
  it("keeps a superseded request suppressed after a cancel and a later switch (sequence)", async () => {
    const requested: string[] = [];
    const settlers = new Map<string, Deferred<Catalog>>();
    /** Settles a request the loader really received — an unseen key fails here, not at the timeout. */
    const settle = (key: string, catalog: Catalog): void => {
      const settler = settlers.get(key);
      expect(settlers.has(key), `no in-flight request for "${key}"`).toBe(true);
      settler!.resolve(catalog);
    };

    const i18n = makeHost();
    i18n.registerLoader((locale, namespace) => {
      const key = `${locale}:${namespace}`;
      requested.push(key);
      const settler = createDeferred<Catalog>();
      settlers.set(key, settler);
      return settler.promise;
    });
    i18n.addTranslations({ en: { hi: "Hi" } });
    const changes: string[] = [];
    i18n.on("localeChanged", ({ from, to }) => changes.push(`${from}->${to}`));

    const toFr = i18n.setLocaleAsync("fr");
    // Re-requesting the CURRENT locale cancels the in-flight switch.
    await i18n.setLocaleAsync("en");
    const toDe = i18n.setLocaleAsync("de");

    expect(requested).toEqual(["fr:default", "de:default"]);

    settle("de:default", { hi: "Hallo" });
    await toDe;
    settle("fr:default", { hi: "Salut" });
    await toFr;

    expect(i18n.locale).toBe("de");
    expect(i18n.t("hi")).toBe("Hallo");
    expect(changes).toEqual(["en->de"]);
  });
});
