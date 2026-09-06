import { useHead, useRuntimeConfig, useRoute, useRequestURL } from "#app";
// A pure function of the locale string — no host, no capability, no state. The
// runtime already imports values from `@comvi/core`'s root (useI18n.ts), so
// this adds no package edge and nothing that could pull the base host in.
import { getTextDirection } from "@comvi/core";
import { useLocaleState } from "../utils/locale-state";
import type { ComputedRef } from "vue";
import { computed } from "vue";
import { stripLocalePrefix, buildLocalizedPath } from "../utils/locale-path";

export interface LocaleHeadOptions {
  /**
   * Base URL for canonical and alternate links
   * @example 'https://example.com'
   */
  baseUrl?: string;

  /**
   * Add OpenGraph locale meta tags
   * @default true
   */
  addOgLocale?: boolean;

  /**
   * Add hreflang alternate links
   * @default true
   */
  addAlternateLinks?: boolean;

  /**
   * Add canonical link
   * @default true
   */
  addCanonical?: boolean;

  /**
   * Add dir attribute to html.
   *
   * The value is the locale object's own `dir` when it declares one, and
   * otherwise the text direction of the same tag `lang` uses (`iso`, or the
   * locale code) — so `locales: ["en", "ar"]`, with no locale objects at all,
   * still ships `<html dir="rtl">` on Arabic.
   *
   * @default true
   */
  addDir?: boolean;

  /**
   * Add lang attribute to html
   * @default true
   */
  addLang?: boolean;
}

/**
 * Composable for SEO-related head tags: html lang/dir, canonical URL, hreflang
 * alternates and OpenGraph locale tags.
 *
 * @example
 * ```vue
 * <script setup>
 * useLocaleHead({
 *   baseUrl: 'https://example.com',
 * })
 * </script>
 * ```
 */
export function useLocaleHead(options: LocaleHeadOptions = {}) {
  const config = useRuntimeConfig();
  const { locales, localeObjects, defaultLocale, localePrefix } = config.public.comvi;
  const localeState = useLocaleState();
  const route = useRoute();

  const {
    addOgLocale = true,
    addAlternateLinks = true,
    addCanonical = true,
    addDir = true,
    addLang = true,
  } = options;

  const getBaseUrl = () => {
    if (options.baseUrl) {
      return options.baseUrl.replace(/\/$/, "");
    }
    try {
      const requestUrl = useRequestURL();
      return `${requestUrl.protocol}//${requestUrl.host}`;
    } catch {
      return "";
    }
  };

  const getCleanPath = () => {
    return stripLocalePrefix(route.path, locales);
  };

  const buildLocalizedUrl = (baseUrl: string, path: string, locale: string) => {
    const localizedPath = buildLocalizedPath(path, locale, defaultLocale, localePrefix);
    return `${baseUrl}${localizedPath}`;
  };

  const headConfig = computed(() => {
    const currentLocale = localeState.value || defaultLocale;
    const localeObj = localeObjects[currentLocale];
    const baseUrl = getBaseUrl();
    const cleanPath = getCleanPath();

    const head: Record<string, unknown> = {};

    // The tag that names this locale to the outside world: `iso` when the
    // locale object carries one, the key otherwise. `lang` and `dir` are two
    // statements about the SAME locale, so they are derived from the same
    // string — a locale keyed `foo` with `iso: "ar"` must not ship
    // `lang="ar" dir="ltr"`.
    const languageTag = localeObj?.iso || currentLocale;

    const htmlAttrs: Record<string, string> = {};
    if (addLang) {
      htmlAttrs.lang = languageTag;
    }
    if (addDir) {
      // A DECLARED direction wins: an author who wrote `dir` meant it, even
      // when it disagrees with the language. Otherwise fall back to the
      // locale's own direction rather than omitting the attribute — `dir` is
      // documented as defaulting to "ltr" and `addDir` as on by default, and
      // omitting it honoured neither: an app configured the way the docs open
      // (`locales: ["en", "de"]`) shipped <html> with no direction at all.
      htmlAttrs.dir = localeObj?.dir ?? getTextDirection(languageTag);
    }
    if (Object.keys(htmlAttrs).length > 0) {
      head.htmlAttrs = htmlAttrs;
    }

    const meta: Array<Record<string, string>> = [];

    if (addOgLocale) {
      meta.push({
        property: "og:locale",
        content: (localeObj?.iso || currentLocale).replace("-", "_"),
      });

      for (const locale of locales) {
        if (locale !== currentLocale) {
          meta.push({
            property: "og:locale:alternate",
            content: (localeObjects[locale]?.iso || locale).replace("-", "_"),
          });
        }
      }
    }

    if (meta.length > 0) {
      head.meta = meta;
    }

    const link: Array<Record<string, string>> = [];

    if (baseUrl) {
      if (addCanonical) {
        link.push({
          rel: "canonical",
          href: buildLocalizedUrl(baseUrl, cleanPath, currentLocale),
        });
      }

      if (addAlternateLinks) {
        for (const locale of locales) {
          link.push({
            rel: "alternate",
            hreflang: localeObjects[locale]?.iso || locale,
            href: buildLocalizedUrl(baseUrl, cleanPath, locale),
          });
        }

        // x-default points at the default locale.
        link.push({
          rel: "alternate",
          hreflang: "x-default",
          href: buildLocalizedUrl(baseUrl, cleanPath, defaultLocale),
        });
      }
    }

    if (link.length > 0) {
      head.link = link;
    }

    return head;
  });

  useHead(headConfig as ComputedRef<Record<string, unknown>>);

  return headConfig;
}
