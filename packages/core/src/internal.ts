/**
 * @comvi/core/internal — seams for bindings, devtools and benches. Not documented,
 * no semver guarantee (design §2.1, R4-15).
 *
 * The binding surface is three functions over an instance's immutable {@link State}:
 * `state(i18n)` (the published snapshot), `view(i18n, state, extra)` (a render-local
 * snapshot with extra catalogs layered in, never published, `rev` unchanged) and
 * `translate(i18n, state, key, params, ns)`, plus `loading(state, ns)`,
 * `coming(i18n, state, ns)` (`isLoading`), `available(i18n, state, ns)` (`isReady`) and
 * `acquire(i18n, ns)` (a consumer's hold) — or, in a binding, `core(i18n)`, the seam those
 * read. A state carries the marking hook of an editor session (`mk`,
 * R3-14 H4), which only the `/devtools` handle sets; nothing here sets it. `handover(i18n)`
 * is what a server render gives the browser (design §2.6, R3-21).
 */
import type { Catalog, Rendered } from "./compile/cache";
import type { Env, Params } from "./compile/scanner";

/**
 * The instance's clock (clock.ts): `live` — a render that is not a component's hydration —
 * counts from the browser's clock even when a server handed over its `serverNow`.
 */
export { clock } from "./clock";
import { CORE, type Core, type I18n } from "./instance";
import { dir } from "./locale";
import { layer, mk, N, type Slot, type State, type Store } from "./state";

export { compile, render, recordFor, lookup, inherit } from "./compile/cache";
/** A prototype-free object with the own properties of its arguments copied in (state.ts). */
export { N } from "./state";
export type { Compiled, CompiledRecord, Render, Rendered } from "./compile/cache";
export type { Env, Params } from "./compile/scanner";
export { formatNumber, pluralRules, intl } from "./compile/fmt";
export { canonicalize, parents, dir, negotiate } from "./locale";
export { defaultOnError } from "./errors";
export type { Chain, Core } from "./instance";
export type { Mark, Slot, State, Store } from "./state";

declare const __DEV__: boolean;

/**
 * The seam of `i18n` (its {@link Core}): a binding calls it once per hook and reads the
 * members it needs, so no wrapper per member ships with it. Development checks that it is
 * an instance; production trusts the types.
 */
export const core = (i18n: I18n): Core => {
  const c = CORE.get(i18n);
  if (__DEV__ && !c) throw new TypeError("[@comvi/core] not an instance of createI18n()");
  return c!;
};

/** The published state of `i18n`. */
export const state = (i18n: I18n): State => core(i18n).s();

/**
 * A consumer of `i18n` holds namespace `ns` (a binding's `useI18n(ns)` at commit or mount):
 * `ns` is active while held, and what the current locale lacks of it loads — but a failed
 * load is never asked again: a remount after a failure does not refetch; `i18n.load(ns)` is
 * the explicit retry. Returns the release (call it once).
 */
export const acquire = (i18n: I18n, ns: string): (() => void) => core(i18n).h(ns);

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
  // The chain gives the locale's direction and canonical tag (an invalid one, which this seam
  // can be handed, renders through its fallbacks). In another locale than the published
  // one, what its chain lacks is loading (`isLoading`; never requested, it is no
  // `missing_key`) by the core's own rule: the switch at commit loads it.
  const h = core(i18n).ch(locale);
  if (c === state.c && locale == state.locale) return state;
  return mk(
    state.rev,
    state.lrev,
    locale,
    h.o ? dir(h[0][1]) : "ltr",
    c,
    state.ld,
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
 * `isLoading` of namespace `ns` of `i18n` in `state` (lot 4c): a load of it is in flight, or
 * the instance has a loader and a pair of the chain of the state's locale is neither in
 * place nor failed (what a consumer's hold loads; its render comes first).
 */
export const coming = (i18n: I18n, state: State, ns: string): boolean => !!core(i18n).w(state, ns);

/**
 * `isReady` of namespace `ns` of `i18n` in `state` (lot 4c): a catalog of it from the chain
 * of the state's locale (that locale, its parents, the fallback locales) is in place — an
 * empty one too; a catalog of a locale outside the chain does not count.
 */
export const available = (i18n: I18n, state: State, ns: string): boolean => core(i18n).r(state, ns);

/** Whether a catalog load is in flight in `state` (for namespace `ns`, or any). */
export const loading = (state: State, ns?: string): boolean =>
  state.ld.some((k) => ns === undefined || k.endsWith("\0" + ns));

/** What a server render hands the browser: public since lot 6a as `@comvi/core/ssr`. */
export { handover, type Handover } from "./ssr";
