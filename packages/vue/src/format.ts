/**
 * @comvi/vue/format — `useFormat()`: the `@comvi/core/format` formatters bound to the app's
 * instance and to the locale on screen (design §3.3). Every call reads that locale
 * reactively, so a template that formats re-renders when the locale changes — and only
 * then. Nothing of it is in an app that does not import this subpath.
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
import { onMounted } from "vue";
import { cell, use } from "./binding";

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

/** Formatters in the locale on screen; a render that calls one re-renders on a locale change. */
export const useFormat = (): Formatters => {
  const i = use();
  // The instance's `locale` slice: a render that formats re-renders on a locale change only.
  const locale = cell(i)[1];
  // Once mounted (after the hydration), a handed-over server clock gives way to the browser's.
  onMounted(() => live(i));
  return {
    number: (v, o) => formatNumber(i, v, o, locale.value),
    currency: (v, c, o) => formatCurrency(i, v, c, o, locale.value),
    date: (v, o) => formatDate(i, v, o, locale.value),
    dateRange: (a, b, o) => formatDateRange(i, a, b, o, locale.value),
    relative: (v, now, o) => formatRelativeTime(i, v, now, o, locale.value),
    list: (v, o) => formatList(i, v, o, locale.value),
    displayName: (c, t) => displayName(i, c, t, locale.value),
  };
};
