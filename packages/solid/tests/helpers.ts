import { vi } from "vitest";
import { createI18n, type Catalog, type I18n, type I18nError, type I18nOptions } from "../src";

/** An instance whose reports are collected instead of printed. */
export const make = (o: I18nOptions): { i18n: I18n; errors: I18nError[] } => {
  const errors: I18nError[] = [];
  const i18n = createI18n({ onError: (e) => errors.push(e), ...o });
  return { i18n, errors };
};

/** Lets every settled promise chain and the core's development idle-read check run. */
export const tick = () => new Promise((y) => setTimeout(y));

/**
 * A loader whose every request waits until the test answers it: `answer("de:shop")` resolves
 * with the table entry (or `{}`), `fail(key)` rejects; `requested` lists the `locale:ns`
 * requests in order.
 */
export const manualLoader = (table: Record<string, Catalog> = {}) => {
  const pending = new Map<string, { y: (c: Catalog) => void; n: (e: unknown) => void }>();
  const requested: string[] = [];
  const load = vi.fn((locale: string, ns: string, _signal: AbortSignal) => {
    const k = `${locale}:${ns}`;
    requested.push(k);
    return new Promise<Catalog>((y, n) => pending.set(k, { y, n }));
  });
  const one = async (
    k: string,
    f: (p: { y: (c: Catalog) => void; n: (e: unknown) => void }) => void,
  ) => {
    const p = pending.get(k);
    if (!p) throw new Error(`no pending request ${k} (have ${[...pending.keys()]})`);
    pending.delete(k);
    f(p);
    await tick();
  };
  return {
    load,
    requested,
    answer: (k: string, c: Catalog = table[k] || {}) => one(k, (p) => p.y(c)),
    fail: (k: string, e: unknown = new Error(`404 ${k}`)) => one(k, (p) => p.n(e)),
  };
};
