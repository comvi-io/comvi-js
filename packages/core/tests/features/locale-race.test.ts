import { describe, it, expect } from "vitest";
// The COMPOSITE host (`src/core/full.ts`), imported directly rather than
// through the tags-registering helper.
import { I18n } from "../../src/core/full";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";
import { attachPlugins } from "../../src/plugins";
import type { I18nEvent, I18nEventData } from "../../src/types";

/**
 * The locale-race seam.
 *
 * The race machinery — changeId staleness arbitration, mid-flight cancellation,
 * the loading refcount — lives in `@comvi/core/loader`, which OVERRIDES
 * `setLocaleAsync`. A bare instance can never have a load in flight, so it must
 * not pay for any of it.
 *
 * The event-trace and race tests that pin the split:
 *  • bare (and plugins-only) hosts: one synchronous `localeChanged`, and NO
 *    `loadingStateChanged` pair;
 *  • loader-carrying hosts (the composite and a composed base host): the race
 *    semantics, identical between the two install surfaces.
 */

interface EventSource {
  on<E extends I18nEvent>(event: E, callback: (data: I18nEventData[E]) => void): () => void;
}

/** Ordered trace of the two events a locale switch can produce. */
function traceLocaleEvents(i18n: EventSource): string[] {
  const trace: string[] = [];
  i18n.on("loadingStateChanged", ({ isLoading }) => trace.push(`loading:${isLoading}`));
  i18n.on("localeChanged", ({ from, to }) => trace.push(`locale:${from}->${to}`));
  return trace;
}

/** A promise whose settlement the test drives. */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("locale switch on a host WITHOUT the loader capability", () => {
  it("applies the locale synchronously and emits localeChanged only", async () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { hi: "Hi" }, fr: { hi: "Salut" } },
    });
    const trace = traceLocaleEvents(i18n);

    const pending = i18n.setLocaleAsync("fr");

    // Nothing to await: the locale is applied before the first microtask.
    expect(i18n.locale).toBe("fr");
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toBeUndefined();

    // Nothing loads on a bare host, so nothing reports loading — no transient
    // `loadingStateChanged` true→false pair.
    expect(trace).toEqual(["locale:en->fr"]);
    expect(i18n.isLoading).toBe(false);
    expect(i18n.t("hi")).toBe("Salut");
  });

  it("emits nothing when the locale does not change", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const trace = traceLocaleEvents(i18n);

    await i18n.setLocaleAsync("en");

    expect(trace).toEqual([]);
    expect(i18n.locale).toBe("en");
  });

  it("applies rapid switches in call order — there is no race to arbitrate", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const trace = traceLocaleEvents(i18n);

    await Promise.all([i18n.setLocaleAsync("fr"), i18n.setLocaleAsync("de")]);

    expect(trace).toEqual(["locale:en->fr", "locale:fr->de"]);
    expect(i18n.locale).toBe("de");
  });

  it("keeps the synchronous `locale` setter working", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const trace = traceLocaleEvents(i18n);

    i18n.locale = "fr";

    expect(i18n.locale).toBe("fr");
    expect(trace).toEqual(["locale:en->fr"]);
  });

  it("stays on the base path when only the plugin host is attached", async () => {
    const i18n = attachPlugins(createI18n({ locale: "en", exposeGlobal: false }));
    const trace = traceLocaleEvents(i18n);

    await i18n.setLocaleAsync("fr");

    expect(trace).toEqual(["locale:en->fr"]);
  });
});

describe.each([
  ["composed host", () => new I18n({ locale: "en", ns: [], exposeGlobal: false })],
  [
    "slim + attachLoader",
    () => attachLoader(createI18n({ locale: "en", ns: [], exposeGlobal: false })),
  ],
] as const)("locale switch on a host WITH the loader capability (%s)", (_label, make) => {
  /** An instance with one active namespace and a loader that resolves on demand. */
  async function setup() {
    const deferreds: Record<string, Deferred<Record<string, string>>> = {};
    const pending = (locale: string): Deferred<Record<string, string>> => {
      const existing = deferreds[locale];
      if (existing) return existing;
      return (deferreds[locale] = createDeferred());
    };

    const i18n = make();
    i18n.registerLoader(async (locale) => pending(locale).promise);
    await i18n.init();

    const activate = i18n.addActiveNamespace("common");
    pending("en").resolve({ hi: "Hi" });
    await activate;

    return { i18n, pending };
  }

  it("brackets the switch with the loading refcount — the 0.4.x trace", async () => {
    const { i18n, pending } = await setup();
    const trace = traceLocaleEvents(i18n);

    const switching = i18n.setLocaleAsync("fr");
    expect(i18n.isLoading).toBe(true);
    // The locale must not apply before its namespaces are loaded (no UI flash).
    expect(i18n.locale).toBe("en");

    pending("fr").resolve({ hi: "Salut" });
    await switching;

    expect(trace).toEqual(["loading:true", "locale:en->fr", "loading:false"]);
    expect(i18n.isLoading).toBe(false);
    expect(i18n.t("hi", { ns: "common" })).toBe("Salut");
  });

  it("emits the loading pair even when no loader is registered", async () => {
    const i18n = make();
    const trace = traceLocaleEvents(i18n);

    await i18n.setLocaleAsync("fr");

    expect(trace).toEqual(["loading:true", "locale:en->fr", "loading:false"]);
  });

  it("suppresses a stale result: the superseded request never applies", async () => {
    const { i18n, pending } = await setup();
    const trace = traceLocaleEvents(i18n);

    const toFr = i18n.setLocaleAsync("fr");
    const toDe = i18n.setLocaleAsync("de");

    pending("de").resolve({ hi: "Hallo" });
    await toDe;
    expect(i18n.locale).toBe("de");

    // The superseded "fr" load lands late — it must change nothing.
    pending("fr").resolve({ hi: "Salut" });
    await toFr;

    expect(i18n.locale).toBe("de");
    expect(i18n.t("hi", { ns: "common" })).toBe("Hallo");
    expect(trace.filter((event) => event.startsWith("locale:"))).toEqual(["locale:en->de"]);
  });

  it("suppresses a stale ERROR: only the latest request's outcome is observed", async () => {
    const { i18n, pending } = await setup();

    const toFr = i18n.setLocaleAsync("fr");
    const toDe = i18n.setLocaleAsync("de");

    pending("de").resolve({ hi: "Hallo" });
    await toDe;

    pending("fr").reject(new Error("fr backend exploded"));

    await expect(toFr).resolves.toBeUndefined();
    expect(i18n.locale).toBe("de");
  });

  it("surfaces the error of a request that was NOT superseded", async () => {
    const { i18n, pending } = await setup();

    const toFr = i18n.setLocaleAsync("fr");
    pending("fr").reject(new Error("fr backend exploded"));

    await expect(toFr).rejects.toThrow(/Failed to load|E_ALL_NAMESPACES_FAILED|fr backend/);
    expect(i18n.locale).toBe("en");
    expect(i18n.isLoading).toBe(false);
  });

  it("cancels a mid-flight change when the current locale is re-requested", async () => {
    const { i18n, pending } = await setup();
    const trace = traceLocaleEvents(i18n);

    const toFr = i18n.setLocaleAsync("fr");
    expect(i18n.locale).toBe("en");

    // Reverting to the ALREADY-APPLIED locale is not a no-op while another
    // change is in flight: it invalidates that change's changeId.
    await i18n.setLocaleAsync("en");

    pending("fr").resolve({ hi: "Salut" });
    await toFr;

    expect(i18n.locale).toBe("en");
    expect(i18n.t("hi", { ns: "common" })).toBe("Hi");
    expect(trace.filter((event) => event.startsWith("locale:"))).toEqual([]);
  });
});

describe("attachLoader install contract for the setLocaleAsync override", () => {
  it("leaves the base implementation on the prototype of a bare instance", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    expect(Object.prototype.hasOwnProperty.call(i18n, "setLocaleAsync")).toBe(false);
    expect(typeof i18n.setLocaleAsync).toBe("function");
  });

  it("seeds the race state from the CURRENT locale, not the constructor locale", async () => {
    const bare = createI18n({ locale: "en", exposeGlobal: false });
    await bare.setLocaleAsync("fr");

    const i18n = attachLoader(bare);
    const trace = traceLocaleEvents(i18n);

    // "fr" is both the applied and the last-requested locale: a silent no-op.
    await i18n.setLocaleAsync("fr");

    expect(trace).toEqual([]);
    expect(i18n.locale).toBe("fr");
  });

  it("keeps working after a repeated attach", async () => {
    const i18n = attachLoader(attachLoader(createI18n({ locale: "en", exposeGlobal: false })));
    const trace = traceLocaleEvents(i18n);

    await i18n.setLocaleAsync("fr");

    expect(trace).toEqual(["loading:true", "locale:en->fr", "loading:false"]);
  });
});
