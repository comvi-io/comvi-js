/**
 * @comvi/react/format — `useFormat()`: the `@comvi/core/format` formatters bound to the
 * nearest provider's instance and to the locale its render shows, re-rendering on a locale
 * change (design §3.3). Nothing of it is in an app that does not import this subpath.
 */
import {
  displayName,
  formatCurrency,
  formatDate,
  formatDateRange,
  formatList,
  formatNumber,
  formatRelativeTime,
} from "@comvi/core/format";
import { live } from "@comvi/core/internal";
import { useEffect, useMemo } from "react";
import { useI18n } from "./binding";

export interface Formatters {
  number(value: number, options?: Intl.NumberFormatOptions | string): string;
  currency(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number, options?: Intl.DateTimeFormatOptions | string): string;
  dateRange(start: Date | number, end: Date | number, options?: Intl.DateTimeFormatOptions): string;
  /**
   * `value` relative to `now` (default: the instance's clock — the handed-over server clock
   * during hydration, the browser's after mount; nothing re-renders as time moves on).
   */
  relative(value: Date | number, now?: number, options?: Intl.RelativeTimeFormatOptions): string;
  list(items: readonly string[], options?: Intl.ListFormatOptions): string;
  displayName(code: string, type?: Intl.DisplayNamesOptions["type"]): string | undefined;
}

/**
 * Formatters in the locale this render shows — the target locale of an `<I18nHandover>`
 * before the instance switches, too. Bound to that locale at render: a formatter kept
 * from an earlier render keeps formatting in the locale that render showed, like its `t`.
 */
export const useFormat = (): Formatters => {
  const { i18n: i, locale: l } = useI18n();
  // After the first commit, a handed-over server clock gives way to the browser's.
  useEffect(() => live(i), [i]);
  return useMemo(
    (): Formatters => ({
      number: (v, o) => formatNumber(i, v, o, l),
      currency: (v, c, o) => formatCurrency(i, v, c, o, l),
      date: (v, o) => formatDate(i, v, o, l),
      dateRange: (a, b, o) => formatDateRange(i, a, b, o, l),
      relative: (v, now, o) => formatRelativeTime(i, v, now, o, l),
      list: (v, o) => formatList(i, v, o, l),
      displayName: (c, t) => displayName(i, c, t, l),
    }),
    [i, l],
  );
};
