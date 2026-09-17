// The compile-time contract of what `getI18n()` returns.
//
// `@comvi/nuxt`'s `useTranslation` returns `{ t, hasTranslation, locale }`, and
// as of 0.5 so does this. The SHAPE is shared deliberately even though the two
// adapters are not — see `docs/design/next-nuxt-parity.md`. The companion
// assertion lives in `packages/nuxt/tests/server-types.test-d.ts` and spells
// the same three members, so neither package can drop one quietly.
import { getI18n } from "@comvi/next/server";
import type { ServerI18n } from "@comvi/next/server";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/** The three members both server helpers must have. Written out, not imported. */
interface SharedServerHelperShape {
  t: unknown;
  hasTranslation: unknown;
  locale: string;
}

// The members, exactly these and no others.
type _keys = Expect<Equal<keyof ServerI18n, "t" | "hasTranslation" | "locale">>;

// `locale` is a plain string — a resolved locale, never `undefined`. A caller
// destructuring it must not have to narrow.
type _localeType = Expect<Equal<ServerI18n["locale"], string>>;

// The shared shape is satisfied.
const _shape: SharedServerHelperShape = {} as ServerI18n;

// And it survives the call: `getI18n()` resolves to the same interface.
type _awaited = Expect<Equal<Awaited<ReturnType<typeof getI18n>>, ServerI18n>>;

async function destructuring() {
  const { t, hasTranslation, locale } = await getI18n();

  const _t: string = t("some.key");
  const _has: boolean = hasTranslation("some.key");
  const _locale: string = locale;

  return { _t, _has, _locale };
}

export type { _keys, _localeType, _awaited };
export { destructuring };
