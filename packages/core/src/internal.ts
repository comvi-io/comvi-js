/**
 * @comvi/core/internal — seams for bindings, devtools and benches. Not documented,
 * no semver guarantee (design §2.1, R4-15).
 *
 * The binding surface is three functions over an instance's immutable {@link State}:
 * `state(i18n)` (the published snapshot), `view(i18n, state, extra)` (a render-local
 * snapshot with extra catalogs layered in, never published, `rev` unchanged) and
 * `translate(i18n, state, key, params, ns)`, plus `loading(state, ns)`,
 * `coming(i18n, state, ns)` and `activate(i18n, ns)`. A state carries the marking hook of an editor session (`mk`,
 * R3-14 H4), which only the `/devtools` handle sets; nothing here sets it. `handover(i18n)`
 * is what a server render gives the browser (design §2.6, R3-21).
 */
import type { Catalog, Rendered } from "./compile/cache";
import type { Env, Params } from "./compile/scanner";
import { CORE, type Core, type I18n } from "./instance";
import { dir } from "./locale";
import { layer, mk, N, type Slot, type State, type Store } from "./state";

export { compile, render, recordFor, lookup, inherit } from "./compile/cache";
export type { Compiled, CompiledRecord, Render, Rendered } from "./compile/cache";
export type { Env, Params } from "./compile/scanner";
export { formatNumber, formatValue, pluralRules, intl } from "./compile/fmt";
export { canonicalize, parents, dir, negotiate } from "./locale";
export { defaultOnError } from "./errors";
export type { Chain, Core } from "./instance";
export type { Mark, Slot, State, Store } from "./state";

declare const __DEV__: boolean;

/** The seam of `i18n`. Development checks that it is an instance; production trusts the types. */
const core = (i18n: I18n): Core => {
  const c = CORE.get(i18n);
  if (__DEV__ && !c) throw new TypeError("[@comvi/core] not an instance of createI18n()");
  return c!;
};

/** The published state of `i18n`. */
export const state = (i18n: I18n): State => core(i18n).s();

/**
 * Activates namespace `ns` of `i18n` (a binding's `useI18n(ns)` after commit): loads what
 * the current locale lacks of it, but never asks a failed load again — a remount after a
 * failure does not refetch; `i18n.load(ns)` is the explicit retry.
 */
export const activate = (i18n: I18n, ns: string): Promise<void> => core(i18n).a(ns);

/**
 * Layered slots per (existing slot, extra catalog): a view rebuilt for the same slot and
 * the same catalog object reuses the slot, so its compiled messages survive re-renders.
 */
const layered = new WeakMap<object, WeakMap<Catalog, Slot>>();
const NO_SLOT = {};

/**
 * A render-local snapshot: `state` with `extra` (namespace → locale → flat catalog)
 * layered over its catalogs, rendered in `locale` (default: the state's own; a binding's
 * locale handover renders the target before `setLocale()` lands at commit). Nothing is
 * published and `rev`/`lrev` do not move; untouched namespaces and locales keep their
 * slots (and compiled messages), and a catalog a slot already holds as its base, in the
 * same locale, gives back `state` itself (no copy per render).
 */
export const view = (
  i18n: I18n,
  state: State,
  extra: Readonly<Record<string, Readonly<Record<string, Catalog>>>>,
  locale: string = state.locale,
): State => {
  let c: Store = state.c;
  for (const n of Object.keys(extra))
    for (const l of Object.keys(extra[n])) {
      const slot = c[n] && c[n][l];
      const m = extra[n][l];
      let memo = layered.get(slot || NO_SLOT);
      if (!memo) layered.set(slot || NO_SLOT, (memo = new WeakMap()));
      let next = memo.get(m);
      if (!next) memo.set(m, (next = layer(slot, m)));
      // The catalog the slot already holds: nothing to layer, no copy of the state.
      if (next === slot) continue;
      if (c === state.c) c = N(c);
      (c as Record<string, Store[string]>)[n] = N(c[n], { [l]: next });
    }
  // The chain gives the locale's direction and canonical tag (an invalid one renders
  // through its fallbacks, as a published state does).
  const x = core(i18n);
  const h = x.ch(locale);
  if (c === state.c && locale == state.locale) return state;
  // Another locale than the published one: what its chain lacks of an active namespace
  // will load when the switch lands at commit, so it counts as loading in the view (its
  // keys are not reported missing, `isLoading` is true) — the view of a handover to a
  // locale nobody handed catalogs for.
  let ld = state.ld;
  if (locale != state.locale)
    for (const n of x.n)
      for (const [k] of h) if (!c[n]?.[k] && !ld.includes(k + "\0" + n)) ld = [...ld, k + "\0" + n];
  return mk(
    state.rev,
    state.lrev,
    locale,
    h.o ? dir(h[0][1]) : "ltr",
    c,
    ld,
    state.dp,
    h.o ? h[0][1] : locale,
    // An editor session's marking hook carries over: render-local output is marked too (H4).
    state.mk,
  );
};

/**
 * `t()` of `i18n` against `state` (a published state or a view). `join` makes what a tag
 * handler receives from its children's parts — every handler's, `defaultParams` ones too.
 */
export const translate = (
  i18n: I18n,
  state: State,
  key: string,
  params?: Params,
  ns?: string,
  join?: Env["j"],
): Rendered => core(i18n).tr(state, key, params, ns, join);

/**
 * Whether namespace `ns` of `i18n` is still coming in `state`: a load of it is in flight,
 * or the instance has a loader and nobody activated `ns` yet while it holds no catalog of
 * the state's locale (a binding's `useI18n(ns)` before its activation after commit). Its
 * keys are not reported missing meanwhile; a binding's `isLoading` (lot 1d).
 */
export const coming = (i18n: I18n, state: State, ns: string): boolean => !!core(i18n).w(state, ns);

/** Whether a catalog load is in flight in `state` (for namespace `ns`, or any). */
export const loading = (state: State, ns?: string): boolean =>
  state.ld.some((k) => ns === undefined || k.endsWith("\0" + ns));

/**
 * What a server render hands the browser (design §2.6, R3-21): the locale, the time zone and
 * the clock the render used, and the catalogs it rendered with — every active namespace in
 * the locale's chain (its parents and fallback locales), in the shape of
 * `createI18n({ catalogs })`. The browser's `createI18n({ ...options, ...handover })` then
 * renders what the server rendered and asks the loader for none of it.
 */
export interface Handover {
  locale: string;
  timeZone?: string;
  /** Epoch ms the server rendered at: `formatRelativeTime` counts from it on both sides. */
  now: number;
  catalogs: Record<string, Record<string, Catalog>>;
}

/**
 * The {@link Handover} of `i18n` as of now (call it after the render). Development throws
 * when the instance has no `timeZone`: a server and a browser in different zones format
 * the same date differently, and the hydration would not match (design §2.6).
 */
export const handover = (i18n: I18n): Handover => {
  const x = core(i18n);
  const s = x.s();
  if (__DEV__ && !x.o.timeZone)
    throw new TypeError(
      "[@comvi/core] a server render needs the timeZone option: the server and the browser must format dates in one zone",
    );
  const catalogs = N<Record<string, Catalog>>();
  for (const n of x.n)
    for (const [l] of x.ch(s.locale)) {
      const y = s.c[n]?.[l];
      // A patched slot is handed over as one catalog: the base with the patch on top.
      if (y) (catalogs[n] ||= N())[l] = y.p ? N(y.m, y.p) : y.m;
    }
  return { locale: s.locale, timeZone: x.o.timeZone, now: x.o.now ?? Date.now(), catalogs };
};
