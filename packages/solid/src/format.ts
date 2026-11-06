/**
 * @comvi/solid/format — `useFormat()`: the `@comvi/core/format` formatters over the nearest
 * provider's instance and its locale, read at the call, so a JSX expression or a memo that
 * formats re-runs on a locale change, and only then (design §3.3). Nothing of it is in an app
 * that does not import this subpath.
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
import { createSignal, onMount, sharedConfig } from "solid-js";
import { isServer } from "solid-js/web";
import { useCtx } from "./binding";

export interface Formatters {
  number(value: number, options?: Intl.NumberFormatOptions | string): string;
  currency(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  date(value: Date | number, options?: Intl.DateTimeFormatOptions | string): string;
  dateRange(start: Date | number, end: Date | number, options?: Intl.DateTimeFormatOptions): string;
  /**
   * `value` relative to `options.now` (default: the instance's clock — a handed-over server
   * clock while this component hydrates, the browser's from its mount on; nothing re-runs as
   * time moves on).
   */
  relative(value: Date | number, options?: RelativeTimeOptions): string;
  list(items: readonly string[], options?: Intl.ListFormatOptions): string;
  displayName(code: string, type?: Intl.DisplayNamesOptions["type"]): string | undefined;
}

/** Formatters in the locale on screen. It activates no namespace (it translates nothing). */
export const useFormat = (): Formatters => {
  const [i, , l] = useCtx();
  // A server render and a hydration count from the request's one clock; every other render from
  // the browser's. A hydrated component goes live at its mount, as React's after its hydration.
  const [live, go] = createSignal(!isServer && !sharedConfig.context);
  if (!live()) onMount(() => go(true));
  return {
    number: (v, o) => formatNumber(i, v, o, l()),
    currency: (v, c, o) => formatCurrency(i, v, c, o, l()),
    date: (v, o) => formatDate(i, v, o, l()),
    dateRange: (a, b, o) => formatDateRange(i, a, b, o, l()),
    relative: (v, o) =>
      formatRelativeTime(i, v, live() ? { ...o, now: o?.now ?? clock(i, 1) } : o, l()),
    list: (v, o) => formatList(i, v, o, l()),
    displayName: (c, t) => displayName(i, c, t, l()),
  };
};
