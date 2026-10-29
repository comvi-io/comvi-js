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
  type RelativeTimeOptions,
} from "@comvi/core/format";
import { clock } from "@comvi/core/internal";
import { getCurrentInstance, onMounted } from "vue";
import { cell, use } from "./binding";

export interface Formatters {
  number(value: number, options?: Intl.NumberFormatOptions | string): string;
  currency(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number, options?: Intl.DateTimeFormatOptions | string): string;
  dateRange(start: Date | number, end: Date | number, options?: Intl.DateTimeFormatOptions): string;
  /**
   * `value` relative to `options.now` (default: the instance's clock — a handed-over server
   * clock while this component hydrates, the browser's for every other render; nothing
   * re-renders as time moves on).
   */
  relative(value: Date | number, options?: RelativeTimeOptions): string;
  list(items: readonly string[], options?: Intl.ListFormatOptions): string;
  displayName(code: string, type?: Intl.DisplayNamesOptions["type"]): string | undefined;
}

/** Formatters in the locale on screen; a render that calls one re-renders on a locale change. */
export const useFormat = (): Formatters => {
  const i = use();
  // The instance's `locale` slice: a render that formats re-renders on a locale change only.
  const locale = cell(i)[1];
  // A component that hydrates has its server node already (`vnode.el`, set before its
  // setup — a lazily hydrated one too): it counts from the handed-over server clock until
  // it has mounted. A component mounted after the hydration, or outside one, is live at once.
  // A server render is never live: it counts from the request's one clock.
  const c = getCurrentInstance();
  let live = typeof document < "u" && !c?.vnode.el;
  if (!live) onMounted(() => (live = true));
  return {
    number: (v, o) => formatNumber(i, v, o, locale.value),
    currency: (v, c, o) => formatCurrency(i, v, c, o, locale.value),
    date: (v, o) => formatDate(i, v, o, locale.value),
    dateRange: (a, b, o) => formatDateRange(i, a, b, o, locale.value),
    relative: (v, o) =>
      formatRelativeTime(i, v, live ? { ...o, now: o?.now ?? clock(i, 1) } : o, locale.value),
    list: (v, o) => formatList(i, v, o, locale.value),
    displayName: (c, t) => displayName(i, c, t, locale.value),
  };
};
