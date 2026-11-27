/**
 * BUG COM-216 B (open, not fixed here; pinned as it is): a `load(ns)` waiting while a server
 * payload hands the pair over as `null` (`<I18nHandover catalogs>`) resolves with an `Error`, and
 * `onError` hears nothing. Ignored, the call raises no `unhandledRejection` (the core's commands
 * resolve with their failure); awaited, the app gets the server's `Error`.
 *
 * `unhandled()` sets Vitest's own `unhandledRejection` listeners aside while `fn` runs plus
 * one macrotask, and puts them back (see core tests/outcomes.ts).
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

describe("BUG COM-216 B, pinned: load(ns) a handover's null slot ends, onError set", () => {
  it("ignored: no report reaches onError, and no unhandledRejection fires", async () => {
    const { i18n, errors, handOver } = setup();
    const seen = await unhandled(async () => {
      void i18n.load("extra");
      await handOver();
    });
    expect(seen).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("awaited: resolves with the server's Error, no report, no unhandledRejection", async () => {
    const { i18n, errors, handOver } = setup();
    let got: unknown;
    const seen = await unhandled(async () => {
      const p = (async () => {
        got = await i18n.load("extra");
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
