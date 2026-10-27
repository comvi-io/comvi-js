/**
 * @comvi/core/internal — seams for bindings, devtools and benches. Not documented,
 * no semver guarantee (design §2.1, R4-15).
 *
 * The binding surface is three functions over an instance's immutable {@link State}:
 * `state(i18n)` (the published snapshot), `view(i18n, state, extra)` (a render-local
 * snapshot with extra catalogs layered in, never published, `rev` unchanged) and
 * `translate(i18n, state, key, params, ns)`, plus `loading(state, ns)`.
 */
import type { Catalog, Rendered } from "./compile/cache";
import type { Params } from "./compile/scanner";
import { CORE, type Core, type I18n } from "./instance";
import { layer, mk, N, type Slot, type State, type Store } from "./state";

export { compile, render, recordFor, lookup, inherit } from "./compile/cache";
export type { Compiled, CompiledRecord, Render, Rendered } from "./compile/cache";
export type { Env, Params } from "./compile/scanner";
export { formatNumber, formatValue, pluralRules, intl } from "./compile/fmt";
export { canonicalize, parents, dir, negotiate } from "./locale";
export { defaultOnError } from "./errors";
export type { Chain, Core } from "./instance";
export type { Slot, State, Store } from "./state";

const core = (i18n: I18n): Core => {
  const c = CORE.get(i18n);
  if (!c) throw new TypeError("[@comvi/core] not an instance of createI18n()");
  return c;
};

/** The published state of `i18n`. */
export const state = (i18n: I18n): State => core(i18n).s();

/**
 * Layered slots per (existing slot, extra catalog): a view rebuilt for the same slot and
 * the same catalog object reuses the slot, so its compiled messages survive re-renders.
 */
const layered = new WeakMap<object, WeakMap<Catalog, Slot>>();
const NO_SLOT = {};

/**
 * A render-local snapshot: `state` with `extra` (namespace → locale → flat catalog)
 * layered over its catalogs. Nothing is published and `rev` does not move; untouched
 * namespaces and locales keep their slots (and compiled messages), and a catalog a slot
 * already holds as its base gives back `state` itself (no copy per render).
 */
export const view = (
  i18n: I18n,
  state: State,
  extra: Readonly<Record<string, Readonly<Record<string, Catalog>>>>,
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
  core(i18n);
  return c === state.c
    ? state
    : mk(state.rev, state.lrev, state.locale, state.dir, c, state.ld, state.dp, state.tg);
};

/** `t()` of `i18n` against `state` (a published state or a view). */
export const translate = (
  i18n: I18n,
  state: State,
  key: string,
  params?: Params,
  ns?: string,
): Rendered => core(i18n).tr(state, key, params, ns);

/** Whether a catalog load is in flight in `state` (for namespace `ns`, or any). */
export const loading = (state: State, ns?: string): boolean =>
  state.ld.some((k) => ns === undefined || k.endsWith("\0" + ns));

export {
  EDITOR_MAPPINGS_GLOBAL,
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  readEditorMappings,
  toRecordOfNumbers,
} from "./editor";
export type { InContextEditorMappings } from "./editor";
