/**
 * The typed `t()` signature (design rev 3 R3-1/R3-2, rev 4 R4-4; measured in lot-0
 * spike S2 — `.omc/artifacts/reference-i18n-2026-10/lot0/S2/recommended-signature.ts`).
 *
 * Typegen (lot 3) augments `Catalogs` with one interface member per namespace:
 *
 *   declare module "@comvi/core" { interface Catalogs { default: {
 *     "cart.items": { count: number };
 *     "hello":      { name: string | number; brand?: string };  // `brand` is in defaultParams → optional
 *     "terms":      { link: Tag };                                // a Tag-typed param marks the key as rich
 *     "title":      never;                                        // no params
 *   } } }
 *
 * Gates (scripts/types-bench, CI): check ≤ 1.0 s at 2 ns × 20k keys × 300 calls, a key
 * typo ≤ 5 s total, 5k → 20k scaling ≤ 2.5×, and the 11 negative diagnostics of
 * `tests/types/negative.ts` keep their codes. Before changing anything here, read the
 * rejected alternatives below — each was measured slower or less precise.
 */

/** Translation catalogs per namespace, augmented by generated declarations. */
export interface Catalogs {}

/**
 * A rich-text tag handler. Its argument is the tag's children as the BINDING delivers
 * them: rich parts (`RichParts`) from the core's `t()`, one React node from
 * `@comvi/react` (lot 1c). It is typed loosely so a binding's handler type, such as
 * `(chunks: ReactNode) => ReactNode`, satisfies a catalog's `Tag` param.
 */
export type Tag = (chunks: any) => unknown;

/** What a rich message renders: strings and whatever the tag handlers returned. */
export type RichParts = readonly unknown[];

/** The declared namespaces. */
export type NsOf = keyof Catalogs;

declare const notAKey: unique symbol;
/**
 * Marker for "the key could not be inferred" (a typo): params stay loose, only the key errs.
 * Its name shows in the key diagnostic (`… not assignable to parameter of type 'NotAKey |
 * "a" | "b"'`), so it is named for the reader of that line.
 */
type NotAKey = { [notAKey]: true };

type U2I<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/**
 * Keys per namespace as a MAPPED type. tsc does not cache `keyof X` for a concrete X,
 * so `keyof Catalogs[N]` in a generic signature rebuilds the key union several times per
 * call — check time linear in catalog size (3.6 s at 20k keys). A property of a resolved
 * mapped type is cached once per program. Do NOT turn this into a conditional alias or a
 * typegen-emitted key union: both bring the O(keys) scan back (measured, S2).
 */
export type KeysOf = { [N in NsOf]: keyof Catalogs[N] };

/**
 * Params of key K in namespace N. A union key gets the INTERSECTION of its members' params.
 *
 * Typo guard (R3-2): the key's constraint is `KeysOf[N] | NotAKey`. When the key argument
 * is not a key, tsc infers K as the whole constraint, which then CONTAINS `NotAKey`: the
 * params go loose (only the key errs) instead of intersecting 5,000 param objects
 * (≈190 s of tsc at 5k keys). A real key never infers `NotAKey`, so a namespace with ONE
 * key, or a union key that spans every key of a small namespace, keeps its exact params —
 * the earlier guard, `[KeysOf[N]] extends [K]`, could not tell those from a typo.
 */
export type ParamsFor<N extends NsOf, K extends KeysOf[N] | NotAKey> = [NotAKey] extends [K]
  ? NotAKey
  : [Catalogs[N][Exclude<K, NotAKey>]] extends [never]
    ? never
    : U2I<Catalogs[N][Exclude<K, NotAKey>]>;

/**
 * The params argument. Per-call options are written INLINE (no alias), so diagnostics show
 * `{ ns?: "shop" | undefined; locale?: string | undefined }` and never an internal name.
 */
export type Args<N, P> = [P] extends [NotAKey]
  ? [params?: { ns?: NsOf; locale?: string } & Record<string, unknown>]
  : [P] extends [never]
    ? [params?: { ns?: N; locale?: string }]
    : {} extends P // every param has a default (defaultParams)
      ? [params?: P & { ns?: N; locale?: string }]
      : [params: P & { ns?: N; locale?: string }];

/** A key with a Tag-typed param renders rich parts; every other key renders a string. */
export type OutOf<P, Rich> = [P] extends [never] ? string : Tag extends P[keyof P] ? Rich : string;

/**
 * `t()` for namespace NS. Per call, `{ ns }` switches the namespace (and the key set) and
 * `{ locale }` the locale; both are optional members of the params object.
 */
export type TranslateFn<NS extends NsOf, Rich = string> = <
  K extends KeysOf[N] | NotAKey,
  N extends NsOf = NS,
>(
  key: K,
  ...args: Args<N, ParamsFor<N, K>>
) => OutOf<ParamsFor<N, K>, Rich>;

/** `t()` of a project with no generated catalogs: any key, any params, a string. */
export type UntypedT = (key: string, params?: Record<string, unknown>) => string;

/** The `t()` a binding hands out for namespace NS: typed when catalogs are declared. */
export type TFor<NS extends string = "default", Rich = RichParts> = [NsOf] extends [never]
  ? UntypedT
  : NS extends NsOf
    ? TranslateFn<NS, Rich>
    : never;
