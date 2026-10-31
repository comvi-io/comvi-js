import { flushSync, mount, tick as svelteTick, unmount, type Component } from "svelte";
import { vi } from "vitest";
import { createI18n, type Catalog, type I18n, type I18nError, type I18nOptions } from "../src";
import With from "./fixtures/With.svelte";

/** An instance whose reports are collected instead of printed. */
export const make = (o: I18nOptions): { i18n: I18n; errors: I18nError[] } => {
  const errors: I18nError[] = [];
  const i18n = createI18n({ onError: (e) => errors.push(e), ...o });
  return { i18n, errors };
};

/** Svelte's hydration and block markers, for comparing rendered HTML. */
export const strip = (html: string) => html.replace(/<!--.*?-->/g, "");

/** Mounts `C` with `props` under `setI18n(i18n)`. */
export const mountWith = (i18n: I18n, C: unknown, props: Record<string, unknown> = {}) => {
  const target = document.createElement("div");
  const app = mount(With as Component<any>, { target, props: { i18n, C, ...props } });
  flushSync();
  return {
    target,
    html: () => strip(target.innerHTML),
    text: () => target.textContent,
    unmount: () => unmount(app),
  };
};

/** Lets every settled promise chain run, then Svelte's scheduler. */
export const settle = async () => {
  await new Promise((y) => setTimeout(y));
  await svelteTick();
  flushSync();
};

/** A loader whose every request waits until the test answers it (as in @comvi/vue's tests). */
export const manualLoader = (table: Record<string, Catalog> = {}) => {
  const pending = new Map<string, { y: (c: Catalog) => void; n: (e: unknown) => void }>();
  const requested: string[] = [];
  const load = vi.fn((locale: string, ns: string) => {
    const k = `${locale}:${ns}`;
    requested.push(k);
    return new Promise<Catalog>((y, n) => pending.set(k, { y, n }));
  });
  const settleOne = async (
    k: string,
    f: (p: { y: (c: Catalog) => void; n: (e: unknown) => void }) => void,
  ) => {
    const p = pending.get(k);
    if (!p) throw new Error(`no pending request ${k} (have ${[...pending.keys()]})`);
    pending.delete(k);
    f(p);
    await settle();
  };
  return {
    load,
    requested,
    answer: (k: string, c: Catalog = table[k] || {}) => settleOne(k, (p) => p.y(c)),
    fail: (k: string, e: unknown = new Error(`404 ${k}`)) => settleOne(k, (p) => p.n(e)),
  };
};

/** Console errors and warnings printed while `f` ran. */
export const warnings = async (f: () => unknown): Promise<string[]> => {
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
