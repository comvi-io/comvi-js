// The routing options are ONE schema, `@comvi/locale-routing`'s
// `RoutingOptions`. `@comvi/nuxt` takes the same types
// (`packages/nuxt/tests/routing-options.test-d.ts`); this file proves next's
// public spellings ARE those types, so a key cannot exist in one package only.
import type {
  LocaleCookieConfig as SharedCookie,
  LocaleCookieOptions as SharedCookieOptions,
  LocaleDetectionConfig as SharedDetection,
  LocaleDetectionSource as SharedSource,
  ResolveAcceptLanguage as SharedResolve,
} from "@comvi/locale-routing";
import { createMiddleware } from "../../src/middleware/createMiddleware";
import { defineRouting } from "../../src/routing/defineRouting";
import type {
  LocaleCookieConfig,
  LocaleCookieOptions,
  LocaleDetectionConfig,
  LocaleDetectionSource,
  MiddlewareConfig,
  ResolveAcceptLanguage,
} from "../../src/middleware/types";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type _cookie = Expect<Equal<LocaleCookieConfig, SharedCookie>>;
type _cookieOptions = Expect<Equal<LocaleCookieOptions, SharedCookieOptions>>;
type _detection = Expect<Equal<LocaleDetectionConfig, SharedDetection>>;
type _source = Expect<Equal<LocaleDetectionSource, SharedSource>>;
type _resolve = Expect<Equal<ResolveAcceptLanguage, SharedResolve>>;
type _middlewareDetection = Expect<
  Equal<MiddlewareConfig["localeDetection"], false | SharedDetection | undefined>
>;

const routing = { locales: ["en", "de"], defaultLocale: "en" } as const;

// The old spellings are gone, not deprecated.
createMiddleware({
  ...routing,
  // @ts-expect-error -- `localeDetection.cookieName` was removed: use `localeCookie`.
  localeDetection: { cookieName: "LANG" },
});
createMiddleware({
  ...routing,
  // @ts-expect-error -- `localeDetection.cookieSecure` was removed: use `localeCookie.secure`.
  localeDetection: { cookieSecure: false },
});
// @ts-expect-error -- `localeCookie` has no `cookieName`; the key is `name`.
defineRouting({ ...routing, localeCookie: { cookieName: "LANG" } });

createMiddleware({ ...routing, localeCookie: { name: "LANG", secure: false } });
