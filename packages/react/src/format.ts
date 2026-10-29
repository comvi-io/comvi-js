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
  type RelativeTimeOptions,
} from "@comvi/core/format";
import { clock } from "@comvi/core/internal";
import { useMemo, useSyncExternalStore } from "react";
import { useCtx, useLocale } from "./binding";

export interface Formatters {
  number(value: number, options?: Intl.NumberFormatOptions | string): string;
  currency(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number, options?: Intl.DateTimeFormatOptions | string): string;
  dateRange(start: Date | number, end: Date | number, options?: Intl.DateTimeFormatOptions): string;
  /**
   * `value` relative to `options.now` (default: the instance's clock — a handed-over server
   * clock for this component's hydration render, the browser's for every other render;
   * nothing re-renders as time moves on).
   */
  relative(value: Date | number, options?: RelativeTimeOptions): string;
  list(items: readonly string[], options?: Intl.ListFormatOptions): string;
  displayName(code: string, type?: Intl.DisplayNamesOptions["type"]): string | undefined;
}

const none = () => () => {};
const yes = () => 1;
const no = () => 0;

/**
 * Formatters in the locale this render shows — the target locale of an `<I18nHandover>`
 * before the instance switches, too. Bound to that locale at render: a formatter kept
 * from an earlier render keeps formatting in the locale that render showed, like its `t`.
 * It activates no namespace (it translates nothing).
 */
export const useFormat = (): Formatters => {
  const [i] = useCtx();
  const l = useLocale();
  // `0` for a server render and a hydration render (this component's, a Suspense boundary
  // hydrated later too: React reads the server snapshot), `1` for every other render. React
  // re-renders a hydrated component once after its hydration, so its time goes live then.
  const live = useSyncExternalStore(none, yes, no);
  return useMemo(
    (): Formatters => ({
      number: (v, o) => formatNumber(i, v, o, l),
      currency: (v, c, o) => formatCurrency(i, v, c, o, l),
      date: (v, o) => formatDate(i, v, o, l),
      dateRange: (a, b, o) => formatDateRange(i, a, b, o, l),
      // A hydration counts from the handed-over server clock; every other render from the
      // browser's (`clock` keeps an explicit `now` option fixed).
      relative: (v, o) =>
        formatRelativeTime(i, v, live ? { ...o, now: o?.now ?? clock(i, 1) } : o, l),
      list: (v, o) => formatList(i, v, o, l),
      displayName: (c, t) => displayName(i, c, t, l),
    }),
    [i, l, live],
  );
};
