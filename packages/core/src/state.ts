/**
 * The immutable state snapshot and the catalog slots (design §2.5, R4-1, R4-15).
 *
 * A catalog lives in a SLOT per (namespace, locale): `{ m, c, p?, pc? }` — the base
 * catalog `m` and its compiled record `c` (resolved ONCE when the slot is made, so
 * `t()` never touches the compile cache's WeakMap), plus an optional small PATCH layer
 * `p` with its own record `pc`. `add()` on a slot that already holds a catalog writes a
 * new patch — O(|patch|), never O(catalog) — and keeps the base catalog and every
 * compiled message of it (R4-1b). After {@link FLAT} patched keys the patch is flattened
 * into a new base that inherits the compiled messages whose template did not change.
 *
 * Every `State` is built by {@link mk}, which also derives the primary record `pr`:
 * the compiled record of the default namespace at the state's locale, when that slot
 * has no patch. `t(key)` without params returns `pr[key]` when it is a string. Because
 * `pr` is derived from the state it lives on, no path can replace a slot and keep a
 * stale `pr` (R4-1d) — a stale-prim test runs every slot-replacing path.
 */
import {
  inherit,
  lookup,
  recordFor,
  type Catalog,
  type Compiled,
  type CompiledRecord,
} from "./compile/cache";
import { arg } from "./compile/scanner";

export interface Slot {
  /** Base catalog, kept by reference (R4-12). */
  readonly m: Catalog;
  /** Compiled record of `m`, shared by every instance holding `m`. */
  readonly c: CompiledRecord;
  /** Patch layer written by `add()` over an existing base. */
  readonly p?: Catalog;
  /** Compiled record of `p`. */
  readonly pc?: CompiledRecord;
}

/** Namespace → locale (as the app spells it) → slot. */
export type Store = Readonly<Record<string, Readonly<Record<string, Slot>>>>;

export interface State {
  /** Moves on every published change. */
  readonly rev: number;
  /** Moves only when the locale changes (derived-state handover, R4-15). */
  readonly lrev: number;
  /** The locale as the app spells it. */
  readonly locale: string;
  readonly dir: "ltr" | "rtl";
  /** The catalogs. */
  readonly c: Store;
  /** Catalog loads in flight, as `locale + "\0" + ns`. */
  readonly ld: readonly string[];
  /** Primary record: default namespace at `locale`, when that slot has no patch. */
  readonly pr: CompiledRecord | undefined;
  /** The canonical tag of `locale` (what Intl receives on the fast path). */
  readonly tg: string;
  /** The instance's `defaultParams` as of this state (an own copy, never the caller's object). */
  readonly dp: Readonly<Record<string, unknown>> | null | undefined;
}

/** Patched keys kept as a layer before the patch is flattened into a new base. */
export const FLAT = 256;

/** A prototype-free object, with the own properties of `from` copied in (later wins). */
export const N = <T = unknown>(...from: (object | null | undefined)[]): Record<string, T> =>
  Object.assign(Object.create(null), ...from);

/** A state. The only constructor of one: `pr` is always derived here (R4-1d). */
export const mk = (
  rev: number,
  lrev: number,
  locale: string,
  dir: "ltr" | "rtl",
  c: Store,
  ld: readonly string[],
  dp: State["dp"],
  tg: string,
  s = c.default?.[locale],
): State => ({ rev, lrev, locale, dir, c, ld, dp, tg, pr: s && !s.p ? s.c : undefined });

/**
 * The slot that results from adding `msgs` to `slot`. An empty pair keeps `msgs` BY
 * REFERENCE as the base (R4-12); the catalog the slot already holds as its unpatched base
 * gives back the slot itself (a Provider re-adding a stable prop costs nothing and
 * publishes nothing); otherwise `msgs` is merged into the patch layer, and a patch past
 * {@link FLAT} keys is flattened into a new base that inherits the compiled messages of
 * the old one.
 */
export const layer = (slot: Slot | undefined, msgs: Catalog): Slot => {
  if (!slot) return { m: msgs, c: recordFor(msgs) };
  if (slot.m == msgs && !slot.p) return slot;
  const p = N<string>(slot.p, msgs);
  if (Object.keys(p).length > FLAT) {
    const m: Catalog = Object.freeze(N<string>(slot.m, p));
    return { m, c: inherit(slot.m, slot.c, m) };
  }
  return {
    m: slot.m,
    c: slot.c,
    p: Object.freeze(p),
    pc: slot.p ? inherit(slot.p, slot.pc!, p) : recordFor(p),
  };
};

/**
 * The compiled message for `key` in a slot: the patch first, then the base. An empty
 * string is a translation nobody wrote yet — what the platform publishes for an
 * untranslated key — and counts as missing.
 */
export const find = (slot: Slot, key: string): Compiled | undefined => {
  const f =
    slot.p && typeof arg(slot.p, key) == "string"
      ? lookup(slot.pc!, slot.p, key)
      : lookup(slot.c, slot.m, key);
  return f === "" ? undefined : f;
};

/**
 * A new store with `msgs` layered at (ns, locale); every other pair is shared. `c` itself
 * when the slot does not change.
 */
export const put = (c: Store, ns: string, locale: string, msgs: Catalog): Store => {
  const o = c[ns]?.[locale];
  const n = layer(o, msgs);
  if (n == o) return c;
  const s = N<Record<string, Slot>>(c);
  (s[ns] = N(c[ns]))[locale] = n;
  return s;
};
