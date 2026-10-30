import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, type Component } from "vue";
import { vi } from "vitest";
import { createI18n, type Catalog, type I18nError, type I18nOptions, type VueI18n } from "../src";

/** An instance whose reports are collected instead of printed. */
export const make = (o: I18nOptions): { i18n: VueI18n; errors: I18nError[] } => {
  const errors: I18nError[] = [];
  const i18n = createI18n({ onError: (e) => errors.push(e), ...o });
  return { i18n, errors };
};

/** Mounts `root` in an app that installed `i18n`. */
export const mountWith = (i18n: VueI18n, root: Component, props?: Record<string, unknown>) =>
  mount(root, { props, global: { plugins: [i18n] } });

/** A component whose render is `render()`: counts its renders in `count`. */
export const probe = (render: () => unknown) => {
  const counter = { count: 0 };
  const C = defineComponent({
    setup: () => () => {
      counter.count++;
      return h("p", null, render() as never);
    },
  });
  return { C, counter };
};

/** Lets the core's development idle-read diagnostic run: it re-checks after the render's task. */
export const tick = () => new Promise((y) => setTimeout(y));

/** Lets every settled promise chain run, then Vue's scheduler. */
export const settle = async () => {
  await flushPromises();
  await nextTick();
};

/**
 * A loader whose every request waits until the test answers it: `answer("de:shop")`
 * resolves with the table entry (or `{}`), `fail(key)` rejects; `requested` lists the
 * `locale:ns` requests in order.
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
    pending,
    signals,
    answer: (k: string, c: Catalog = table[k] || {}) => settleOne(k, (p) => p.y(c)),
    fail: (k: string, e: unknown = new Error(`404 ${k}`)) => settleOne(k, (p) => p.n(e)),
  };
};

/** Console errors and warnings Vue printed while `f` ran. */
export const vueWarnings = async (f: () => unknown): Promise<string[]> => {
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
