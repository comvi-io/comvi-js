/**
 * The clock of an instance (design §2.6, lot 4b): its `now` option, fixed for the
 * instance's life; else the `serverNow` a server render handed over (`handover()`), until
 * a binding marks the app mounted (`live()`, from `useFormat()`), then the browser's
 * running clock — the hydration formats what the server formatted, later renders count
 * from the real time (nothing re-renders by itself when it moves); else, on a server, the
 * epoch of its first reading, kept for the instance's life — an instance per request, so
 * the request's render and its `handover()` count from ONE clock; else (a browser) the
 * running clock. Shared by `/format` and `/internal`, so neither row of the core's main
 * entry carries it.
 */
import { CORE, type I18n } from "./instance";

const T0 = new WeakMap<I18n, number>();
/** Instances whose app has mounted: a handed-over `serverNow` no longer applies. */
const LIVE = new WeakSet<I18n>();

export const clock = (i18n: I18n): number => {
  const o = CORE.get(i18n)?.o;
  if (o?.now != null) return o.now;
  if (o?.serverNow != null && !LIVE.has(i18n)) return o.serverNow;
  if (typeof document != "undefined") return Date.now();
  let t = T0.get(i18n);
  if (t === undefined) T0.set(i18n, (t = Date.now()));
  return t;
};

/** The app of `i18n` has mounted: a handed-over `serverNow` gives way to the running clock. */
export const live = (i18n: I18n): void => void LIVE.add(i18n);
