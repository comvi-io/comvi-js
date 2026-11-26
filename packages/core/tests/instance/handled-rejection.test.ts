/**
 * With the `onError` option, the promise `setLocale()` / `load()` returns is marked handled
 * once `onError` has the failure's report: ignoring it raises no global `unhandledRejection`,
 * awaiting it still rejects with the original reason. Without `onError` nothing changes. A
 * promise derived from it (`.then(fn)`, an `async` wrapper) is the caller's and stays
 * unhandled; a rejection `onError` never heard of is not marked.
 *
 * Observing an unhandled rejection: Vitest's own `unhandledRejection` listeners fail the run,
 * so `unhandled()` sets them aside while `fn` runs plus one macrotask (every rejection here
 * settles in microtasks) and puts them back before returning.
 */
import { describe, expect, it } from "vitest";
import type { I18nError } from "../../src/errors";
import { createI18n, type I18n, type I18nOptions } from "../../src/instance";
import { core } from "../../src/internal";
import { manualLoader } from "./helpers";

const unhandled = async (fn: () => unknown): Promise<unknown[]> => {
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

const boom = new Error("boom");
/** `fr` and namespace `extra` fail with `boom`; a `sync` loader throws it inside the call. */
const setup = (withOnError: boolean, sync = false) => {
  const errors: I18nError[] = [];
  const o: I18nOptions = {
    locale: "en",
    catalogs: { default: { en: { a: "A" } } },
    loader: (l, n) => {
      if (l == "fr" || n == "extra") {
        if (sync) throw boom;
        return Promise.reject(boom);
      }
      return Promise.resolve({ a: l });
    },
  };
  if (withOnError) o.onError = (e) => void errors.push(e);
  return { i18n: createI18n(o), errors };
};

type Call = (i18n: I18n) => Promise<void>;
const calls: [string, Call][] = [
  ["setLocale()", (i) => i.setLocale("fr")],
  ["load()", (i) => i.load("extra")],
];

describe.each(calls)("%s with a failing load", (_name, call) => {
  it.each([false, true])(
    "1. ignored, onError set (sync loader throw: %s): onError gets load_failed, no unhandledRejection",
    async (sync) => {
      const { i18n, errors } = setup(true, sync);
      expect(await unhandled(() => void call(i18n))).toEqual([]);
      expect(errors.map((e) => [e.code, e.cause])).toEqual([["load_failed", boom]]);
    },
  );

  it("2. ignored, no onError: the unhandledRejection still fires with the loader's error", async () => {
    const { i18n } = setup(false);
    const seen = await unhandled(() => void call(i18n));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(boom);
  });

  it.each([true, false])(
    "3. awaited (onError set: %s): rejects with the very error the loader threw",
    async (withOnError) => {
      const { i18n } = setup(withOnError);
      let got: unknown;
      expect(
        await unhandled(async () => {
          got = await call(i18n).then(
            () => "resolved",
            (e: unknown) => e,
          );
        }),
      ).toEqual([]);
      expect(got).toBe(boom);
    },
  );

  it("a derived promise is the caller's: .then(fn) with onError set still rejects unhandled", async () => {
    const { i18n } = setup(true);
    const seen = await unhandled(() => void call(i18n).then(() => {}));
    expect(seen).toEqual([boom]);
  });

  it("a derived promise is the caller's: an async wrapper with onError set still rejects unhandled", async () => {
    const { i18n } = setup(true);
    const seen = await unhandled(
      () =>
        void (async () => {
          await call(i18n);
        })(),
    );
    expect(seen).toEqual([boom]);
  });
});

describe("setLocale() with an invalid tag", () => {
  it.each<[string, unknown]>([
    ["a malformed tag", "!!"],
    ["a non-string argument", 42],
  ])(
    "%s, ignored, onError set: onError gets invalid_locale, no unhandledRejection",
    async (_c, tag) => {
      const { i18n, errors } = setup(true);
      expect(await unhandled(() => void i18n.setLocale(tag as string))).toEqual([]);
      expect(errors.map((e) => e.code)).toEqual(["invalid_locale"]);
    },
  );

  it("ignored, no onError: the unhandledRejection still fires with a RangeError", async () => {
    const { i18n } = setup(false);
    const seen = await unhandled(() => void i18n.setLocale("!!"));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(RangeError);
  });

  it.each([true, false])("awaited (onError set: %s): throws a RangeError", async (withOnError) => {
    const { i18n } = setup(withOnError);
    await expect(i18n.setLocale("!!")).rejects.toThrow(RangeError);
  });

  it("a derived promise is the caller's: .then(fn) with onError set still rejects unhandled", async () => {
    const { i18n } = setup(true);
    const seen = await unhandled(() => void i18n.setLocale("!!").then(() => {}));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(RangeError);
  });
});

// BUG COM-216 (pre-existing, open, not fixed here): on both paths the rejection reaches no
// `onError` report, so it is not marked handled: ignored, it stays globally visible; caught by
// the app, it is the app's alone (the core adds no second unhandled promise).
describe("BUG COM-216: a rejection onError got no report for, onError set", () => {
  /** (A) On `de-AT`: `setLocale("de")`, then `load("default")` re-binds `de`'s flight as the
   * parent of the locale on screen, whose catalog is in place; `de` fails: the deferred report
   * never fires, yet the switch rejects with the loader's error. */
  const parentRebind = () => {
    const l = manualLoader();
    const errors: I18nError[] = [];
    const i18n = createI18n({
      locale: "de-AT",
      catalogs: { default: { "de-AT": { a: "A" } } },
      loader: l.load,
      onError: (e) => void errors.push(e),
    });
    return { i18n, errors, fail: (e: Error) => l.fail("de:default", e) };
  };

  it("(A) setLocale(parent), ignored: no report, the unhandledRejection fires with the loader's error", async () => {
    const { i18n, errors, fail } = parentRebind();
    const e = new Error("de failed");
    const seen = await unhandled(async () => {
      void i18n.setLocale("de");
      void i18n.load("default");
      await fail(e);
    });
    expect(seen).toEqual([e]);
    expect(errors.filter((x) => x.code == "load_failed")).toEqual([]);
  });

  it("(A) setLocale(parent), try/await/catch: the original cause, no unhandledRejection", async () => {
    const { i18n, errors, fail } = parentRebind();
    const e = new Error("de failed");
    let got: unknown;
    const seen = await unhandled(async () => {
      const p = (async () => {
        try {
          await i18n.setLocale("de");
        } catch (x) {
          got = x;
        }
      })();
      void i18n.load("default");
      await fail(e);
      await p;
    });
    expect(seen).toEqual([]);
    expect(got).toBe(e);
    expect(errors.filter((x) => x.code == "load_failed")).toEqual([]);
  });

  /** (B) through the INTERNAL entry (`Core.f`, what `<I18nHandover catalogs>` of
   * `@comvi/react` calls at commit; the public test is react
   * tests/handover-null-rejection.test.tsx): `load("extra")` waits while a server payload hands
   * the pair over as `null`. */
  const nullSlot = () => {
    const l = manualLoader();
    const errors: I18nError[] = [];
    const i18n = createI18n({
      locale: "en",
      catalogs: { default: { en: {} } },
      loader: l.load,
      onError: (e) => void errors.push(e),
    });
    return { i18n, errors, handOver: () => core(i18n).f("en", "extra", null) };
  };

  it("(B, internal entry) load(ns), ignored: no report, the unhandledRejection fires", async () => {
    const { i18n, errors, handOver } = nullSlot();
    const seen = await unhandled(() => {
      void i18n.load("extra");
      handOver();
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(Error);
    expect(errors).toEqual([]);
  });

  it("(B, internal entry) load(ns), try/await/catch: the error, no unhandledRejection", async () => {
    const { i18n, errors, handOver } = nullSlot();
    let got: unknown;
    const seen = await unhandled(async () => {
      const p = (async () => {
        try {
          await i18n.load("extra");
        } catch (x) {
          got = x;
        }
      })();
      handOver();
      await p;
    });
    expect(seen).toEqual([]);
    expect((got as Error).message).toBe('[@comvi/core] the server could not load "extra" in "en"');
    expect(errors).toEqual([]);
  });
});
