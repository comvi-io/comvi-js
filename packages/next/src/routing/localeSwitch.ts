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
 *    navigation it has cached without a request, and the middleware records
 *    only a page the browser loads, never a client-router fetch.
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
 * Nothing is written for `localeCookie: false` or for a locale the routing
 * does not list. Without a routing config (`<I18nProvider>` with no `routing`
 * prop) the cookie is the default one, `NEXT_LOCALE` with default attributes:
 * the middleware does not record the fetch a client-side switch makes, so the
 * switch is the only thing that can.
 */
export function writeLocaleCookie(routing: Required<RoutingConfig> | null, locale: string): void {
  if (typeof document === "undefined" || (routing && !routing.locales.includes(locale))) return;
  const cookie = normalizeLocaleCookie(routing?.localeCookie, NEXT_LOCALE_COOKIE);
  if (!cookie) return;
  // A browser drops a `Secure` cookie set from a plain-HTTP page.
  document.cookie = serializeLocaleCookie(
    cookie,
    locale,
    cookie.secure && location.protocol === "https:",
  );
}
