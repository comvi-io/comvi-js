/**
 * @comvi/svelte/format — `useFormat()`: the `@comvi/core/format` formatters with the real
 * instance and the locale read reactively at each call (design §3.3), so a template or a
 * `$derived` that formats re-runs on a switch. Nothing of it is in an app that does not import
 * this subpath.
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
import { onMount } from "svelte";
import { use } from "./context.svelte.js";

export interface Formatters {
  number(value: number, options?: Intl.NumberFormatOptions | string): string;
  currency(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number, options?: Intl.DateTimeFormatOptions | string): string;
  dateRange(start: Date | number, end: Date | number, options?: Intl.DateTimeFormatOptions): string;
  /**
   * `value` relative to `options.now` (default: the instance's clock — a handed-over server
   * clock until this component has mounted, then the browser's; nothing re-renders as time
   * moves on).
   */
  relative(value: Date | number, options?: RelativeTimeOptions): string;
  list(items: readonly string[], options?: Intl.ListFormatOptions): string;
  displayName(code: string, type?: Intl.DisplayNamesOptions["type"]): string | undefined;
}

/** Formatters in the locale on screen; what calls one re-runs on a locale change. */
export const useFormat = (): Formatters => {
  const c = use();
  const i = c.i;
  // False for a server render and a hydration: both count from the request's one clock.
  // The mount re-runs what read it (accepted: as React's re-render after a hydration).
  let live = $state(false);
  onMount(() => void (live = true));
  return {
    number: (v, o) => formatNumber(i, v, o, c.s.locale),
    currency: (v, k, o) => formatCurrency(i, v, k, o, c.s.locale),
    date: (v, o) => formatDate(i, v, o, c.s.locale),
    dateRange: (a, b, o) => formatDateRange(i, a, b, o, c.s.locale),
    relative: (v, o) =>
      formatRelativeTime(i, v, live ? { ...o, now: o?.now ?? clock(i, 1) } : o, c.s.locale),
    list: (v, o) => formatList(i, v, o, c.s.locale),
    displayName: (k, t) => displayName(i, k, t, c.s.locale),
  };
};
