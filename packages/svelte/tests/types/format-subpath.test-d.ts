// `@comvi/svelte/format` carries core's own formatter types, `LocaleSource` included.
import type { LocaleSource as CoreLocaleSource } from "@comvi/core";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  type LocaleSource,
} from "../../src/format";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type _SameLocaleSource = Expect<Equal<LocaleSource, CoreLocaleSource>>;

const source: LocaleSource = { locale: "de", fallbackLocales: ["en"] };
export const formatted: string[] = [
  formatNumber(source, 1),
  formatDate(source, 0),
  formatCurrency(source, 1, "EUR"),
  formatRelativeTime(source, -1, "day"),
];
