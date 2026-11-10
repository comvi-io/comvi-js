/**
 * Nested catalogs (lot 6a, owner decision D1 of 2026-11-10): the ONE rule by which a catalog of
 * JSON becomes the flat catalog the core reads. The core runs it on every catalog it accepts
 * (`messages`, `catalogs`, `add()`, a loader's result, a binding's handover); the type
 * generator imports this file and the CLI reaches it through the generator, so the three see the
 * same keys.
 *
 * - A group is a plain object (prototype `Object.prototype` or `null`): its keys join the
 *   parent's with ".". `{ "account": { "greeting": "…" } }` is the key `account.greeting`, the
 *   same key as `{ "account.greeting": "…" }`. Nesting groups keys; it creates no namespace.
 * - A leaf is a string. Any other value (an array, a number, a boolean, `null`, another object)
 *   is an invalid leaf: left out and reported (`2`).
 * - A collision is a key two leaves give (`"a.b"` beside `a: { b }`): the first in the
 *   catalog's own key order is kept, the other left out and reported (`1`). Nothing overwrites.
 * - Key names are data: `__proto__` or `constructor`, as a group or a leaf, is an own key of a
 *   prototype-free result; no prototype is read or changed.
 *
 * A catalog whose values are all strings is returned AS IS (no copy, the input's identity): the
 * flat path costs one pass of `typeof`. The input is never mutated.
 */
/** A flat catalog (the shape of `Catalog` of compile/cache.ts, restated: this file imports nothing). */
type Catalog = Readonly<Record<string, string>>;

/** A catalog as an app may write it: flat keys, or groups of them. */
export interface CatalogInput {
  readonly [key: string]: string | CatalogInput;
}

/** Reports a left-out key: `1` a collision, `2` an invalid leaf. */
export type FlatReport = (key: string, kind: 1 | 2) => void;

const group = (v: unknown, p?: unknown): boolean =>
  !!v && typeof v == "object" && ((p = Object.getPrototypeOf(v)) == null || p == Object.prototype);

export const flat = (m: CatalogInput | Catalog, r?: FlatReport): Catalog => {
  for (const k in m)
    if (typeof m[k] != "string") {
      const o: Record<string, string> = Object.create(null);
      const w = (x: object, p: string) => {
        for (const k of Object.keys(x)) {
          const v = (x as Record<string, unknown>)[k];
          const y = p + k;
          if (typeof v == "string") {
            if (y in o) r?.(y, 1);
            else o[y] = v;
          } else if (group(v)) w(v as object, y + ".");
          else r?.(y, 2);
        }
      };
      w(m, "");
      return o;
    }
  return m as Catalog;
};
