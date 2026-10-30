import { act } from "@testing-library/react";
import { vi } from "vitest";
import { createI18n, type Catalog, type I18n, type I18nError, type I18nOptions } from "../src";

/** An instance whose reports are collected instead of printed. */
export const make = (o: I18nOptions): { i18n: I18n; errors: I18nError[] } => {
  const errors: I18nError[] = [];
  const i18n = createI18n({ onError: (e) => errors.push(e), ...o });
  return { i18n, errors };
};

/**
 * A loader whose every request waits until the test answers it: `answer("de:shop")`
 * resolves with the table entry (or `{}`), `fail(key)` rejects; `requested` lists the
 * `locale:ns` requests in order. Both run inside act(), so the provider commits.
 */
export const manualLoader = (table: Record<string, Catalog> = {}) => {
  const pending = new Map<string, { y: (c: Catalog) => void; n: (e: unknown) => void }>();
  const requested: string[] = [];
  const signals = new Map<string, AbortSignal>();
  const load = vi.fn((locale: string, ns: string, signal: AbortSignal) => {
    const k = `${locale}:${ns}`;
    requested.push(k);
    signals.set(k, signal);
    return new Promise<Catalog>((y, n) => pending.set(k, { y, n }));
  });
  const settle = (
    k: string,
    f: (p: { y: (c: Catalog) => void; n: (e: unknown) => void }) => void,
  ) =>
    act(async () => {
      const p = pending.get(k);
      if (!p) throw new Error(`no pending request ${k} (have ${[...pending.keys()]})`);
      pending.delete(k);
      f(p);
      await flush();
    });
  return {
    load,
    requested,
    pending,
    signals,
    answer: (k: string, c: Catalog = table[k] || {}) => settle(k, (p) => p.y(c)),
    fail: (k: string, e: unknown = new Error(`404 ${k}`)) => settle(k, (p) => p.n(e)),
  };
};

/** Lets every settled promise chain run. */
export const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** Lets the core's development idle-read diagnostic run: it re-checks after the render's task. */
export const tick = () => new Promise((y) => setTimeout(y));

/** flush() inside act(), so what the settled work published commits. */
export const settle = () => act(flush);

/** Console errors and warnings React printed while `f` ran (key warnings and the like). */
export const reactWarnings = async (f: () => unknown): Promise<string[]> => {
  const seen: string[] = [];
  const err = vi.spyOn(console, "error").mockImplementation((...a) => void seen.push(a.join(" ")));
  const warn = vi.spyOn(console, "warn").mockImplementation((...a) => void seen.push(a.join(" ")));
  try {
    await f();
  } finally {
    err.mockRestore();
    warn.mockRestore();
  }
  return seen;
};
