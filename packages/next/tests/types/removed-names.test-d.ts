// 0.5 is a new library: `@comvi/next/client` re-exports only `@comvi/react`'s
// current names. The host is `useI18nHost()`.
import * as clientEntry from "../../src/client";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type _NoUseI18nContext = Expect<
  Equal<"useI18nContext" extends keyof typeof clientEntry ? true : false, false>
>;
