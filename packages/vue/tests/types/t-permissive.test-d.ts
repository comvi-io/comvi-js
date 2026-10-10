/**
 * Wave 6 Lot 3, CASE 5 — an app with no generated types must keep compiling.
 *
 * `PermissiveKey` is `string` while `TranslationKeys` is empty and `never`
 * afterwards, which is what widens `AcceptedKey` to `string` and makes
 * `ArgsFor` hand back loose params. Replacing the three overloads with one
 * signature could have lost that in either direction — a key union that no
 * longer widens, or params that stay required — so this program keeps the
 * registry OPEN and asserts the untyped path directly.
 *
 * This program is already keys-OPEN, and stays that way: `declare module
 * "@comvi/core"` is global to whichever program contains it, so a single
 * augmentation anywhere here would close the registry for every file in it.
 * vue's closed-registry assertions live in `tests/types-keys-closed/`, a
 * second program.
 */

import { useI18n } from "../../src/index";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const { t, tRaw } = useI18n();

// Any key, any params, and no second argument required.
t("anything", { any: 1 });
t("anything");
t("some.nested.key", { count: 2, locale: "uk", ns: "admin" });
tRaw("anything", { any: 1 });

// The key parameter is `string` itself, not a closed union.
export type _KeyWidensToString = Expect<Equal<Parameters<typeof t>[0], string>>;

export {};
