/**
 * BUG COM-216 (open, not fixed here): a `load(ns)` waiting while a server payload hands the
 * pair over as `null` (`<I18nHandover catalogs>`) rejects, and `onError` hears nothing. With the
 * `onError` option the core marks only a rejection it reported handled (core changeset
 * "handled rejection with onError"), so this one stays the app's: ignored, it is a global
 * `unhandledRejection`; caught, it is the app's alone, with no second unhandled promise.
 *
 * `unhandled()` sets Vitest's own `unhandledRejection` listeners aside while `fn` runs plus
 * one macrotask, and puts them back (see core tests/instance/handled-rejection.test.ts).
 */
import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createI18n, I18nHandover, I18nProvider, type I18nError } from "../src";
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

/** `load("extra")` in flight, then a handover whose payload carries `extra`/`en` as `null`. */
const setup = () => {
  const l = manualLoader();
  const errors: I18nError[] = [];
  const i18n = createI18n({
    locale: "en",
    catalogs: { default: { en: { a: "A" } } },
    loader: l.load,
    onError: (e) => void errors.push(e),
  });
  const handOver = () =>
    act(async () => {
      render(
        <I18nProvider i18n={i18n}>
          <I18nHandover catalogs={{ extra: { en: null } }}>x</I18nHandover>
        </I18nProvider>,
      );
    });
  return { i18n, errors, handOver };
};

describe("BUG COM-216: load(ns) a handover's null slot ends, onError set", () => {
  it("ignored: no report reaches onError, and the rejection stays globally visible", async () => {
    const { i18n, errors, handOver } = setup();
    const seen = await unhandled(async () => {
      void i18n.load("extra");
      await handOver();
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(Error);
    expect(errors).toEqual([]);
  });

  it("caught with try/await/catch: the app gets the error, and no unhandledRejection fires", async () => {
    const { i18n, errors, handOver } = setup();
    let got: unknown;
    const seen = await unhandled(async () => {
      const p = (async () => {
        try {
          await i18n.load("extra");
        } catch (e) {
          got = e;
        }
      })();
      await handOver();
      await p;
    });
    expect(seen).toEqual([]);
    expect(got).toBeInstanceOf(Error);
    expect((got as Error).message).toBe('[@comvi/core] the server could not load "extra" in "en"');
    expect(errors).toEqual([]);
  });
});
