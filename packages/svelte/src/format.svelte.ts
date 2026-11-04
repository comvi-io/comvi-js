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
   * `value` relative to `options.now`, by default the instance's clock. Of everything here only
   * that time source changes at this component's mount. Before the mount — a server render, a
   * hydration, and the first render of a component mounted later (after a client navigation,
   * behind an `{#if}`) — it is the `serverNow` of an instance created from a `handover()`, else
   * the running clock; from the mount on, the browser's clock, and the mount re-runs what called
   * `relative()` once. So a late-mounted component of a handed-over instance renders first
   * against the server's clock, then against the browser's. Nothing re-renders as time moves on.
   */
  relative(value: Date | number, options?: RelativeTimeOptions): string;
  list(items: readonly string[], options?: Intl.ListFormatOptions): string;
  displayName(code: string, type?: Intl.DisplayNamesOptions["type"]): string | undefined;
}

/** Formatters in the locale on screen; what calls one re-runs on a locale change. */
export const useFormat = (): Formatters => {
  const c = use();
  const i = c.i;
  // False until this component's mount (Svelte has no public hydration signal): a server
  // render, a hydration and a late-mounted component's first render count from the instance's
  // clock. The mount re-runs what read it (accepted: as React's re-render after a hydration).
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
