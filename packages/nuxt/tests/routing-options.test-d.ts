import { describe, expectTypeOf, it } from "vitest";
import type {
  LocaleCookieConfig,
  LocaleDetectionConfig,
  RoutingOptions,
} from "../src/runtime/_vendor/locale-routing";
import type { NuxtI18nOptions } from "../src/types";

/**
 * The routing options are ONE schema, the shared `RoutingOptions`.
 * `packages/next/tests/types/routing-options.test-d.ts` proves next's public
 * spellings are the same types; this file proves nuxt's, so a key cannot exist
 * in one package only. `locales` is the one deliberate exception: nuxt also
 * takes `LocaleObject` entries (next gains them in 0.6).
 */
describe("nuxt's routing options are the shared schema", () => {
  it("takes the same localeCookie, localeDetection, localePrefix and ns", () => {
    expectTypeOf<NuxtI18nOptions["localeCookie"]>().toEqualTypeOf<LocaleCookieConfig | undefined>();
    expectTypeOf<NuxtI18nOptions["localeDetection"]>().toEqualTypeOf<
      false | LocaleDetectionConfig | undefined
    >();
    expectTypeOf<NuxtI18nOptions["localePrefix"]>().toEqualTypeOf<RoutingOptions["localePrefix"]>();
    expectTypeOf<NuxtI18nOptions["ns"]>().toEqualTypeOf<RoutingOptions["ns"]>();
    expectTypeOf<NuxtI18nOptions["defaultLocale"]>().toEqualTypeOf<
      RoutingOptions["defaultLocale"]
    >();
  });

  it("rejects the spellings 0.5 does not have", () => {
    const base = { locales: ["en"], defaultLocale: "en" };
    // @ts-expect-error -- `detectBrowserLanguage` is not an option: `localeCookie` and `localeDetection`.
    const removed: NuxtI18nOptions = { ...base, detectBrowserLanguage: false };
    // @ts-expect-error -- `fallbackLanguage` is not an option: `fallbackLocale`.
    const renamed: NuxtI18nOptions = { ...base, fallbackLanguage: "en" };
    const nested: NuxtI18nOptions = {
      ...base,
      // @ts-expect-error -- `localeDetection.cookieName` is not an option: `localeCookie.name`.
      localeDetection: { cookieName: "x" },
    };
    void [removed, renamed, nested];
  });
});
