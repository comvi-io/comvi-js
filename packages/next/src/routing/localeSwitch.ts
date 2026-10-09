import { normalizeLocaleCookie, serializeLocaleCookie } from "@comvi/locale-routing";
import type { RoutingConfig } from "./types";
import { NEXT_LOCALE_COOKIE } from "./defineRouting";

/**
 * An explicit locale switch: a navigation that NAMES its locale
 * (`router.push(href, locale)`, `<Link locale>`) and asks for another one than
 * the page is in.
 *
 * Under `localePrefix: "as-needed"` the default locale's URL carries no prefix,
 * and under `"never"` no URL does. The middleware resolves such a URL from the
 * locale cookie, which still holds the locale being switched AWAY from, and
 * redirects straight back. Two things make the switch win, and both are needed:
 *
 * 1. The switch navigates to the locale-PREFIXED URL (`/en/about`), which the
 *    middleware reads as an explicit choice: it records the locale in the
 *    cookie and redirects to the public URL (`/about`). A prefixed URL is also
 *    its own entry in Next's client router cache, where the unprefixed one may
 *    hold a redirect that an earlier prefetch was answered with.
 * 2. The switch writes the cookie itself, in the browser. Next answers a
 *    navigation it has cached without a request, so the middleware never sees
 *    it and the cookie would keep the previous choice.
 */

const switchRoutingCache = new WeakMap<Required<RoutingConfig>, Required<RoutingConfig>>();

/** `routing` with every locale prefixed: what a switch builds its URL with. */
export function getSwitchRouting(routing: Required<RoutingConfig>): Required<RoutingConfig> {
  let switchRouting = switchRoutingCache.get(routing);
  if (!switchRouting) {
    switchRouting = { ...routing, localePrefix: "always" };
    switchRoutingCache.set(routing, switchRouting);
  }
  return switchRouting;
}

/**
 * Record `locale` in the locale cookie, with the name and attributes the
 * middleware writes it with.
 *
 * Nothing is written without a routing config (no cookie is known), for
 * `localeCookie: false`, or for a locale the routing does not list.
 */
export function writeLocaleCookie(routing: Required<RoutingConfig> | null, locale: string): void {
  if (!routing || typeof document === "undefined" || !routing.locales.includes(locale)) return;
  const cookie = normalizeLocaleCookie(routing.localeCookie, NEXT_LOCALE_COOKIE);
  if (!cookie) return;
  // A browser drops a `Secure` cookie set from a plain-HTTP page.
  document.cookie = serializeLocaleCookie(
    cookie,
    locale,
    cookie.secure && location.protocol === "https:",
  );
}
