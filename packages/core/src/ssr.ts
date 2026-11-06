/**
 * @comvi/core/ssr — what a server render hands the browser (design §2.6, R3-21; public since
 * lot 6a, R3-25): `handover(i18n)`, the snapshot the browser's `createI18n({ ...options,
 * ...payload })` starts from. The same implementation `@comvi/core/internal` re-exports for the
 * bindings: one payload format.
 */
import type { Catalog } from "./compile/cache";
import { clock } from "./clock";
import { CORE, type I18n } from "./instance";
import { N } from "./state";

declare const __DEV__: boolean;

/**
 * What a server render hands the browser (design §2.6, R3-21): the locale, the time zone and
 * the clock the render used, and every catalog the instance has in place — inline, loaded or
 * `add()`ed, of every locale (a per-call `{ locale }` read outside the locale's chain, its
 * parents and fallback locales too; owner 30.10) — in the shape of `createI18n({ catalogs })`,
 * every slot whose load failed as `null`. Nothing is tracked during the render, and handing a
 * catalog over makes no namespace active and changes no locale. The browser's
 * `createI18n({ ...options, ...handover })` then renders what the server rendered and asks
 * the loader for none of it; a `null` slot is asked for again only on an explicit retry
 * (`i18n.load(ns)`, a switch to its locale).
 */
export interface Handover {
  locale: string;
  timeZone?: string;
  /**
   * The request's clock (epoch ms): the `now` option, else the one a server instance took
   * when it first read the clock (clock.ts). A binding's `useFormat()` counts from it on
   * both sides for a component's hydration, from the browser's clock for every other
   * render (lot 4b).
   */
  serverNow: number;
  /** By namespace, then locale; `null`: the load of that slot failed on the server. */
  catalogs: Record<string, Record<string, Catalog | null>>;
}

/**
 * The {@link Handover} of `i18n` as of now (call it after the render). Development throws
 * when the instance has no `timeZone`: a server and a browser in different zones format
 * the same date differently, and the hydration would not match (design §2.6).
 */
export const handover = (i18n: I18n): Handover => {
  const x = CORE.get(i18n)!;
  if (__DEV__ && !x) throw new TypeError("[@comvi/core] not an instance of createI18n()");
  const s = x.s();
  if (__DEV__ && !x.o.timeZone)
    throw new TypeError(
      "[@comvi/core] a server render needs the timeZone option: the server and the browser must format dates in one zone",
    );
  const catalogs = N<Record<string, Catalog | null>>();
  // Every catalog in place, whatever its locale: an inline one a passive read rendered (no
  // consumer holds anything in a React server render), one a per-call `{ locale }` read. A
  // patched slot is handed over as one catalog: the base with the patch on top.
  for (const n in s.c)
    for (const l in s.c[n]) {
      const y = s.c[n][l]!;
      (catalogs[n] ||= N())[l] = y.p ? N(y.m, y.p) : y.m;
    }
  // A slot whose load failed (the negative cache) is handed over as `null`, so the browser
  // renders the fallback the server rendered and does not ask for it at hydration (R3-21);
  // `createI18n` keeps it failed until an explicit retry (`load(ns)`, a switch to its locale).
  x.b.forEach((_, k) => {
    const [l, n] = k.split("\0");
    (catalogs[n] ||= N())[l] ??= null;
  });
  return { locale: s.locale, timeZone: x.o.timeZone, serverNow: clock(i18n), catalogs };
};
