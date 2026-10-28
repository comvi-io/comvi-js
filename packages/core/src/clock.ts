/**
 * The clock of an instance (design §2.6): its `now` option; else, on a server, the epoch
 * of its first reading, kept for the instance's life — an instance per request, so the
 * request's render and its `handover()` count from ONE clock and the browser formats what
 * the server formatted; else (a browser) the running clock. Shared by `/format` and
 * `/internal`, so neither row of the core's main entry carries it.
 */
import { CORE, type I18n } from "./instance";

const T0 = new WeakMap<I18n, number>();

export const clock = (i18n: I18n): number => {
  const o = CORE.get(i18n)?.o;
  if (o?.now != null) return o.now;
  if (typeof document != "undefined") return Date.now();
  let t = T0.get(i18n);
  if (t === undefined) T0.set(i18n, (t = Date.now()));
  return t;
};
