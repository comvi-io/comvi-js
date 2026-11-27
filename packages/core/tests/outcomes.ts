/**
 * The outcome of `setLocale()` and `load()`, "failure or nothing": each resolves with an `Error`
 * where it used to reject (the loader's own `Error`, the same object; any other reason wrapped in
 * an `Error` whose `cause` is it; the `RangeError` of an invalid tag) and with `undefined` on
 * every other path. No call rejects for these outcomes and none raises an `unhandledRejection`,
 * ignored or not, with or without the `onError` option. The locale on screen, the readiness
 * facts a binding reads (`Core.r` isReady, `Core.w` isFetching) and the reports are as before.
 *
 * Shared by the three builds the core is tested in: the source with `__DEV__` true
 * (tests/instance/outcomes.test.ts), with `__DEV__` false (tests/prod/outcomes.test.ts), and the
 * built entries, both builds (tests/dist/outcomes.test.ts). Every loader answer is given by the
 * test; nothing waits on a clock.
 */
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import type { I18nError } from "../src/errors";
import type { I18n, I18nOptions, createI18n as Create } from "../src/instance";
import type { core as CoreOf } from "../src/internal";

export interface Api {
  createI18n: typeof Create;
  core: typeof CoreOf;
  /** The build's `__DEV__`: which messages to expect. */
  dev: boolean;
}

/** Lets every settled promise chain run. */
export const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/**
 * Runs `fn` plus one macrotask with Vitest's own `unhandledRejection` listeners set aside (they
 * fail the run) and returns what reached the global event.
 */
export const unhandled = async (fn: () => unknown): Promise<unknown[]> => {
  const seen: unknown[] = [];
  const own = process.listeners("unhandledRejection");
  const on = (e: unknown) => void seen.push(e);
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", on);
  try {
    await fn();
    await new Promise((y) => setTimeout(y, 0));
  } finally {
    process.off("unhandledRejection", on);
    for (const l of own) process.on("unhandledRejection", l);
  }
  return seen;
};

/**
 * A loader whose requests wait until the test answers them (`answer("fr:default")`) or fails
 * them (`fail(key, reason)`); a key in `sync` throws `E` inside the loader call instead.
 */
export const manual = (sync: string[] = []) => {
  const pending = new Map<string, [(c: Record<string, string>) => void, (e: unknown) => void]>();
  const E = new Error("E");
  const take = (k: string) => {
    const p = pending.get(k);
    if (!p) throw new Error(`no pending request ${k} (have ${[...pending.keys()]})`);
    pending.delete(k);
    return p;
  };
  return {
    E,
    pending,
    load: (l: string, n: string) => {
      const k = `${l}:${n}`;
      if (sync.includes(k)) throw E;
      return new Promise<Record<string, string>>((y, x) => pending.set(k, [y, x]));
    },
    answer: async (k: string, c: Record<string, string> = { a: k }) => {
      take(k)[0](c);
      await flush();
    },
    /** `fail(k)` rejects with `E`; `fail(k, reason)` with `reason`, `undefined` too. */
    fail: async (k: string, ...e: unknown[]) => {
      take(k)[1](e.length ? e[0] : E);
      await flush();
    },
  };
};

type Ctl = ReturnType<typeof manual>;
type Result = Error | undefined;

/** What a call resolves with: nothing, the loader's own `E`, a wrapper of `reason`, ... */
type Value =
  | { is: "undefined" }
  | { is: "E" }
  | { is: "wrapped"; reason: unknown; locale: string; ns: string }
  | { is: "RangeError"; tag: unknown }
  | { is: "server null"; locale: string; ns: string };

interface Case {
  name: string;
  options?: Partial<I18nOptions>;
  /** No loader at all. */
  noLoader?: boolean;
  /** Pairs whose loader call throws `E` synchronously. */
  sync?: string[];
  before?: (i: I18n) => void;
  call: (i: I18n, api: Api) => Promise<Result>;
  /** What the test answers after the call, in order. */
  settle?: (c: Ctl, i: I18n, api: Api) => Promise<void>;
  value: Value;
  locale: string;
  /** [namespace, isReady, isFetching] read from the published state after the settle. */
  facts: [string, boolean, boolean];
  /** The codes `onError` received, in order (every `load_failed` cause is the case's reason). */
  reports: string[];
  reason?: unknown;
  after?: (i: I18n, api: Api) => void;
}

const EN = { default: { en: { a: "A" } } };

/** A proxy of an `Error`, revoked: `instanceof` (any inspection) of it throws a `TypeError`. */
const revoked = Proxy.revocable(new Error("revoked"), {});
revoked.revoke();

const reasons: [string, unknown][] = [
  ["a string", "nope"],
  ["undefined", undefined],
  ["null", null],
  ["0", 0],
  ["a revoked proxy", revoked.proxy],
  // Handed to a promise as is, it would be adopted: the call would resolve `undefined`.
  [
    "an Error with a then method",
    Object.assign(new Error("failed"), { then: (y: (v: unknown) => void) => y(undefined) }),
  ],
  ["an Error of another realm (node:vm)", runInNewContext("new Error('other realm')")],
];

export const cases: Case[] = [
  // setLocale()
  {
    name: "setLocale: success",
    call: (i) => i.setLocale("fr"),
    settle: (c) => c.answer("fr:default"),
    value: { is: "undefined" },
    locale: "fr",
    facts: ["default", true, false],
    reports: [],
  },
  {
    name: "setLocale: own catalog fails, nothing usable",
    call: (i) => i.setLocale("fr"),
    settle: (c) => c.fail("fr:default"),
    value: { is: "E" },
    locale: "en",
    facts: ["default", true, false],
    reports: ["load_failed"],
  },
  {
    name: "setLocale: own catalog fails, the parent's is usable",
    call: (i) => i.setLocale("pt-BR"),
    settle: async (c) => {
      await c.fail("pt-BR:default");
      await c.answer("pt:default");
    },
    value: { is: "undefined" },
    locale: "pt-BR",
    facts: ["default", true, false],
    reports: ["load_failed"],
  },
  {
    name: "setLocale: only a fallback locale's catalog is usable",
    options: { fallbackLocale: "en" },
    call: (i) => i.setLocale("fr"),
    settle: (c) => c.fail("fr:default"),
    value: { is: "E" },
    locale: "en",
    facts: ["default", true, false],
    reports: ["load_failed"],
  },
  {
    name: "setLocale: a partial switch (one namespace of two fails)",
    options: {
      namespaces: ["default", "extra"],
      catalogs: { default: { en: { a: "A" } }, extra: { en: { b: "B" } } },
    },
    call: (i) => i.setLocale("fr"),
    settle: async (c) => {
      await c.answer("fr:default");
      await c.fail("fr:extra");
    },
    value: { is: "undefined" },
    locale: "fr",
    facts: ["extra", false, false],
    reports: ["load_failed"],
  },
  {
    name: "setLocale: overtaken by a newer setLocale()",
    call: (i) => {
      const p = i.setLocale("fr");
      void i.setLocale("de");
      return p;
    },
    settle: (c) => c.answer("de:default"),
    value: { is: "undefined" },
    locale: "de",
    facts: ["default", true, false],
    reports: [],
  },
  {
    name: "setLocale: an invalid tag",
    call: (i) => i.setLocale("!!"),
    value: { is: "RangeError", tag: "!!" },
    locale: "en",
    facts: ["default", true, false],
    reports: ["invalid_locale"],
  },
  {
    name: "setLocale: a non-string argument",
    call: (i) => i.setLocale(42 as unknown as string),
    value: { is: "RangeError", tag: 42 },
    locale: "en",
    facts: ["default", true, false],
    reports: ["invalid_locale"],
  },
  {
    name: "setLocale: no loader",
    noLoader: true,
    call: (i) => i.setLocale("fr"),
    value: { is: "undefined" },
    locale: "fr",
    facts: ["default", false, false],
    reports: [],
  },
  {
    name: "setLocale: a destroyed instance",
    before: (i) => i.destroy(),
    call: (i) => i.setLocale("fr"),
    value: { is: "undefined" },
    locale: "en",
    facts: ["default", true, false],
    reports: [],
  },
  {
    name: "setLocale: a handed-over null at creation is asked for again, and fails",
    options: { catalogs: { default: { en: { a: "A" }, fr: null } } },
    call: (i) => i.setLocale("fr"),
    settle: (c) => c.fail("fr:default"),
    value: { is: "E" },
    locale: "en",
    facts: ["default", true, false],
    reports: ["load_failed"],
  },
  {
    name: "Core.L (handover): the payload's null lands through the fallback",
    options: { catalogs: { default: { en: { a: "A" }, fr: null } } },
    call: (i, api) => api.core(i).L("fr", { default: { fr: null } }),
    value: { is: "undefined" },
    locale: "fr",
    facts: ["default", false, false],
    reports: [],
  },
  {
    name: "Core.L (handover): a failure the payload does not carry",
    call: (i, api) => api.core(i).L("fr", {}),
    settle: (c) => c.fail("fr:default"),
    value: { is: "E" },
    locale: "en",
    facts: ["default", true, false],
    reports: ["load_failed"],
  },
  {
    // COM-216 A stays open: the switch resolves with the loader's Error, onError got no report.
    name: "setLocale: COM-216 A pinned, not fixed: on de-AT, setLocale('de') beside load('default'), de fails: the Error, no report",
    options: { locale: "de-AT", catalogs: { default: { "de-AT": { a: "A" } } } },
    call: (i) => {
      const p = i.setLocale("de");
      void i.load("default");
      return p;
    },
    settle: (c) => c.fail("de:default"),
    value: { is: "E" },
    locale: "de-AT",
    facts: ["default", true, false],
    reports: [],
  },
  ...reasons.map(([n, reason]): Case => ({
    name: `setLocale: the loader rejects with ${n}: wrapped, cause kept`,
    call: (i) => i.setLocale("fr"),
    settle: (c) => c.fail("fr:default", reason),
    value: { is: "wrapped", reason, locale: "fr", ns: "default" },
    locale: "en",
    facts: ["default", true, false],
    reports: ["load_failed"],
    reason,
  })),
  {
    name: "setLocale: the loader throws synchronously",
    sync: ["fr:default"],
    call: (i) => i.setLocale("fr"),
    value: { is: "E" },
    locale: "en",
    facts: ["default", true, false],
    reports: ["load_failed"],
  },

  // load()
  {
    name: "load: success",
    call: (i) => i.load("extra"),
    settle: (c) => c.answer("en:extra"),
    value: { is: "undefined" },
    locale: "en",
    facts: ["extra", true, false],
    reports: [],
  },
  {
    name: "load: own catalog fails, nothing usable",
    call: (i) => i.load("extra"),
    settle: (c) => c.fail("en:extra"),
    value: { is: "E" },
    locale: "en",
    facts: ["extra", false, false],
    reports: ["load_failed"],
  },
  {
    name: "load: own catalog fails, the parent's is usable",
    options: { locale: "pt-BR", catalogs: { default: { "pt-BR": { a: "A" }, pt: {} } } },
    call: (i) => i.load("extra"),
    settle: async (c) => {
      await c.fail("pt-BR:extra");
      await c.answer("pt:extra");
    },
    value: { is: "undefined" },
    locale: "pt-BR",
    facts: ["extra", true, false],
    reports: ["load_failed"],
  },
  {
    name: "load: only a fallback locale's catalog is usable",
    options: {
      locale: "fr",
      fallbackLocale: "en",
      catalogs: { default: { fr: { a: "F" }, en: { a: "A" } } },
    },
    call: (i) => i.load("extra"),
    settle: async (c) => {
      await c.fail("fr:extra");
      await c.answer("en:extra");
    },
    value: { is: "E" },
    locale: "fr",
    facts: ["extra", true, false],
    reports: ["load_failed"],
  },
  {
    name: "load: displaced by a switch",
    call: (i) => i.load("extra"),
    settle: async (c, i) => {
      void i.setLocale("fr");
      await flush();
      await c.answer("fr:default");
    },
    value: { is: "undefined" },
    locale: "fr",
    facts: ["extra", false, true],
    reports: [],
  },
  {
    name: "load: no loader",
    noLoader: true,
    call: (i) => i.load("extra"),
    value: { is: "undefined" },
    locale: "en",
    facts: ["extra", false, false],
    reports: [],
  },
  {
    name: "load: a destroyed instance",
    before: (i) => i.destroy(),
    call: (i) => i.load("extra"),
    value: { is: "undefined" },
    locale: "en",
    facts: ["extra", false, true],
    reports: [],
  },
  {
    name: "load: a handed-over null at creation is asked for again, and fails",
    options: { catalogs: { default: { en: { a: "A" } }, extra: { en: null } } },
    call: (i) => i.load("extra"),
    settle: (c) => c.fail("en:extra"),
    value: { is: "E" },
    locale: "en",
    facts: ["extra", false, false],
    reports: ["load_failed"],
  },
  {
    // COM-216 B stays open: the waiting load resolves with the server's Error, no report.
    name: "load: COM-216 B pinned, not fixed: a handover null under a waiting load(): the server's Error, no report",
    call: (i) => i.load("extra"),
    settle: async (_c, i, api) => {
      api.core(i).f("en", "extra", null);
      await flush();
    },
    value: { is: "server null", locale: "en", ns: "extra" },
    locale: "en",
    facts: ["extra", false, false],
    reports: [],
  },
  {
    name: "load: pinned as today: with no loader, load(ns) on a handed-over null resolves undefined and erases the failed pair",
    noLoader: true,
    options: { catalogs: { default: { en: { a: "A" } }, extra: { en: null } } },
    call: (i) => i.load("extra"),
    value: { is: "undefined" },
    locale: "en",
    facts: ["extra", false, false],
    reports: [],
    after: (i, api) => expect(api.core(i).b.has("en\0extra")).toBe(false),
  },
  ...reasons.map(([n, reason]): Case => ({
    name: `load: the loader rejects with ${n}: wrapped, cause kept`,
    call: (i) => i.load("extra"),
    settle: (c) => c.fail("en:extra", reason),
    value: { is: "wrapped", reason, locale: "en", ns: "extra" },
    locale: "en",
    facts: ["extra", false, false],
    reports: ["load_failed"],
    reason,
  })),
  {
    name: "load: the loader throws synchronously",
    sync: ["en:extra"],
    call: (i) => i.load("extra"),
    value: { is: "E" },
    locale: "en",
    facts: ["extra", false, false],
    reports: ["load_failed"],
  },
];

const NONE = Symbol("not observed");
type Seen = Result | typeof NONE;

/**
 * The four ways an app calls a command. Each starts the call now and returns what reads its
 * value once the test has settled the loads (`NONE` for the ignored form, which sees nothing).
 */
const forms: [string, (call: () => Promise<Result>) => () => Promise<Seen>][] = [
  [
    "ignored",
    (call) => {
      void call();
      return async () => NONE;
    },
  ],
  [
    "awaited",
    (call) => {
      const p = call();
      return async () => await p;
    },
  ],
  [
    ".then(fn)",
    (call) => {
      let v: Seen = NONE;
      const d = call().then((x) => {
        v = x;
      });
      return async () => (await d, v);
    },
  ],
  [
    "an async wrapper",
    (call) => {
      let v: Seen = NONE;
      void (async () => {
        v = await call();
      })();
      return async () => (await flush(), v);
    },
  ],
];

const check = (api: Api, c: Case, ctl: Ctl, got: Result) => {
  const v = c.value;
  if (v.is == "undefined") expect(got).toBeUndefined();
  else if (v.is == "E") expect(got).toBe(ctl.E);
  else if (v.is == "wrapped") {
    expect(got).toBeInstanceOf(Error);
    expect(got!.cause).toBe(v.reason);
    expect("cause" in got!).toBe(true);
    expect(got!.message).toBe(
      api.dev ? `[@comvi/core] could not load "${v.ns}" in "${v.locale}"` : `${v.locale}:${v.ns}`,
    );
  } else if (v.is == "RangeError") {
    expect(got).toBeInstanceOf(RangeError);
    expect(got!.message).toBe(api.dev ? `[@comvi/core] invalid locale "${v.tag}"` : String(v.tag));
  } else {
    expect(got).toBeInstanceOf(Error);
    expect(got!.message).toBe(
      api.dev
        ? `[@comvi/core] the server could not load "${v.ns}" in "${v.locale}"`
        : `${v.locale}\0${v.ns}`,
    );
  }
};

/** Registers the outcome table against one build of the core. */
export const outcomeTable = (build: string, get: () => Promise<Api> | Api) => {
  describe.each(cases)(`${build}: $name`, (c) => {
    it.each(forms.flatMap(([f, form]) => [true, false].map((oe) => [f, oe, form] as const)))(
      "%s, onError set: %s",
      async (_f, withOnError, form) => {
        const api = await get();
        const ctl = manual(c.sync);
        const errors: I18nError[] = [];
        const o: I18nOptions = { locale: "en", catalogs: EN, ...c.options };
        if (!c.noLoader) o.loader = ctl.load;
        if (withOnError) o.onError = (e) => void errors.push(e);
        // The default reporter of a development build prints; a test prints nothing.
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        const i = api.createI18n(o);
        await flush();
        c.before?.(i);
        let got: Seen = NONE;
        const seen = await unhandled(async () => {
          const read = form(() => c.call(i, api));
          await flush();
          await c.settle?.(ctl, i, api);
          got = await read();
        });
        expect(seen).toEqual([]);
        if (got !== NONE) check(api, c, ctl, got);
        expect(i.locale).toBe(c.locale);
        const x = api.core(i);
        const [ns, ready, fetching] = c.facts;
        expect([x.r(x.s(), ns), !!x.w(x.s(), ns)]).toEqual([ready, fetching]);
        if (withOnError) {
          expect(errors.map((e) => e.code)).toEqual(c.reports);
          const reason = "reason" in c ? c.reason : ctl.E;
          for (const e of errors.filter((e) => e.code == "load_failed"))
            expect(e.cause).toBe(reason);
        }
        c.after?.(i, api);
      },
    );
  });
};

/**
 * The language switcher an app writes, `const failure = await setLocale(code); setFailed(failure
 * !== undefined)`, clicked quickly: the flag and the locale on screen after every answer.
 * Scenarios (i)-(v) from the review's rapid-click probe, (vi)-(viii) for a falsy rejection reason
 * and an invalid tag.
 */
const scenarios: [string, string[], (c: Ctl) => Promise<void>, boolean, string][] = [
  ["(i) fr fails slowly, then de lands", ["fr", "de"], (c) => c.answer("de:default"), false, "de"],
  ["(ii) fr lands slowly, then de fails", ["fr", "de"], (c) => c.fail("de:default"), true, "en"],
  ["(iii) fr pending, click back to en", ["fr", "en"], async () => {}, false, "en"],
  ["(iv) fr clicked twice, lands", ["fr", "fr"], (c) => c.answer("fr:default"), false, "fr"],
  ["(v) fr fails, single click", ["fr"], (c) => c.fail("fr:default"), true, "en"],
  ["(vi) fr fails with reject()", ["fr"], (c) => c.fail("fr:default", undefined), true, "en"],
  ["(vii) fr fails with reject(0)", ["fr"], (c) => c.fail("fr:default", 0), true, "en"],
  ["(viii) an invalid tag", ["!!"], async () => {}, true, "en"],
];

export const switcherTable = (build: string, get: () => Promise<Api> | Api) => {
  it.each(scenarios)(`${build}: switcher %s`, async (_n, clicks, settle, failed, locale) => {
    const api = await get();
    const ctl = manual();
    const i = api.createI18n({
      locale: "en",
      catalogs: EN,
      loader: ctl.load,
      onError: () => {},
    });
    let flag: boolean | "unset" = "unset";
    const setFailed = (x: boolean) => void (flag = x);
    const seen = await unhandled(async () => {
      for (const code of clicks) {
        void (async () => {
          const failure = await i.setLocale(code);
          setFailed(failure !== undefined);
        })();
        await flush();
      }
      await settle(ctl);
      await flush();
    });
    expect(seen).toEqual([]);
    expect([flag, i.locale]).toEqual([failed, locale]);
  });
};
