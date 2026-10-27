import { vi } from "vitest";
import type { Catalog } from "../../src/compile/cache";
import type { I18nError } from "../../src/errors";
import { createI18n, type I18n, type I18nOptions } from "../../src/instance";

/** A loader over a fixed table of `locale:ns` catalogs; an absent entry rejects. */
export const tableLoader = (table: Record<string, Catalog>) => {
  const load = vi.fn(async (locale: string, ns: string, _signal: AbortSignal) => {
    const c = table[`${locale}:${ns}`];
    if (!c) throw new Error(`no catalog for ${locale}:${ns}`);
    return c;
  });
  const loaded = () => load.mock.calls.map(([l, n]) => `${l}:${n}`);
  return { load, loaded };
};

/**
 * A loader whose every request waits until the test answers it: `answer("de:default")`
 * resolves with the table entry (or `{}`), `fail(key)` rejects. `signals` keeps each
 * request's AbortSignal.
 */
export const manualLoader = (table: Record<string, Catalog> = {}) => {
  const pending = new Map<string, { y: (c: Catalog) => void; n: (e: unknown) => void }>();
  const signals = new Map<string, AbortSignal>();
  const requested: string[] = [];
  const load = vi.fn((locale: string, ns: string, signal: AbortSignal) => {
    const k = `${locale}:${ns}`;
    requested.push(k);
    signals.set(k, signal);
    return new Promise<Catalog>((y, n) => pending.set(k, { y, n }));
  });
  const answer = async (k: string, c: Catalog = table[k] || {}) => {
    const p = pending.get(k);
    if (!p) throw new Error(`no pending request ${k} (have ${[...pending.keys()]})`);
    pending.delete(k);
    p.y(c);
    await flush();
  };
  const fail = async (k: string, e: unknown = new Error(`404 ${k}`)) => {
    const p = pending.get(k);
    if (!p) throw new Error(`no pending request ${k}`);
    pending.delete(k);
    p.n(e);
    await flush();
  };
  return { load, answer, fail, requested, signals, pending };
};

/** Lets every settled promise chain run. */
export const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** An instance whose reports are collected instead of printed. */
export const make = (o: I18nOptions) => {
  const errors: I18nError[] = [];
  const i18n = createI18n({ onError: (e) => errors.push(e), ...o });
  return { i18n, errors };
};

/** Records what subscribers see: one entry per published change. */
export const trace = (i18n: I18n) => {
  const seen: string[] = [];
  i18n.on(() => seen.push(`${i18n.locale}#${i18n.rev()}`));
  return seen;
};
