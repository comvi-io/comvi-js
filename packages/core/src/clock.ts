/**
 * The clock of an instance (design §2.6, lot 4b): its `now` option, fixed for the
 * instance's life; else, for a render that is not `live`, the `serverNow` a server render
 * handed over (`handover()`) — a binding's `useFormat()` passes `live` for every render but
 * a component's hydration, so the hydration formats what the server formatted and every
 * later render (a component mounted after the hydration too) counts from the real time;
 * else, on a server, the epoch of its first reading, kept for the instance's life — an
 * instance per request, so the request's render and its `handover()` count from ONE clock;
 * else (a browser) the running clock. Nothing re-renders by itself when it moves. Shared by
 * `/format` and `/internal`, so neither row of the core's main entry carries it.
 */
import { CORE, type I18n } from "./instance";

const T0 = new WeakMap<I18n, number>();

export const clock = (i18n: I18n, live?: unknown): number => {
  const o = CORE.get(i18n)!.o;
  if (o.now != null) return o.now;
  if (o.serverNow != null && !live) return o.serverNow;
  if (typeof document != "undefined") return Date.now();
  let t = T0.get(i18n);
  if (t === undefined) T0.set(i18n, (t = Date.now()));
  return t;
};
