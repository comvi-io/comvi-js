import { useHead, useRuntimeConfig, useState, useRoute, useRequestURL } from "#app";
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
   * Add dir attribute to html
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
 * Composable for SEO-related head tags
 *
 * Automatically sets:
 * - html lang and dir attributes
 * - Canonical URL
 * - Alternate hreflang links
 * - OpenGraph locale tags
 *
 * @param options - Configuration options
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
  const localeState = useState<string>("i18n-locale");
  const route = useRoute();

  const {
    addOgLocale = true,
    addAlternateLinks = true,
    addCanonical = true,
    addDir = true,
    addLang = true,
  } = options;

  // Try to get base URL from options, request URL, or environment
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

  // Get clean path without locale prefix
  const getCleanPath = () => {
    return stripLocalePrefix(route.path, locales);
  };

  // Build locale-prefixed URL
  const buildLocalizedUrl = (baseUrl: string, path: string, locale: string) => {
    const localizedPath = buildLocalizedPath(path, locale, defaultLocale, localePrefix);
    return `${baseUrl}${localizedPath}`;
  };

  // Compute head configuration
  const headConfig = computed(() => {
    const currentLocale = localeState.value || defaultLocale;
    const localeObj = localeObjects[currentLocale] || { code: currentLocale };
    const baseUrl = getBaseUrl();
    const cleanPath = getCleanPath();

    const head: Record<string, unknown> = {};

    // HTML attributes
    const htmlAttrs: Record<string, string> = {};
    if (addLang) {
      htmlAttrs.lang = localeObj.iso || currentLocale;
    }
    if (addDir && localeObj.dir) {
      htmlAttrs.dir = localeObj.dir;
    }
    if (Object.keys(htmlAttrs).length > 0) {
      head.htmlAttrs = htmlAttrs;
    }

    // Meta tags
    const meta: Array<Record<string, string>> = [];

    if (addOgLocale) {
      // Current locale
      meta.push({
        property: "og:locale",
        content: (localeObj.iso || currentLocale).replace("-", "_"),
      });

      // Alternate locales
      for (const locale of locales) {
        if (locale !== currentLocale) {
          const altLocaleObj = localeObjects[locale] || { code: locale };
          meta.push({
            property: "og:locale:alternate",
            content: (altLocaleObj.iso || locale).replace("-", "_"),
          });
        }
      }
    }

    if (meta.length > 0) {
      head.meta = meta;
    }

    // Link tags
    const link: Array<Record<string, string>> = [];

    if (baseUrl) {
      if (addCanonical) {
        link.push({
          rel: "canonical",
          href: buildLocalizedUrl(baseUrl, cleanPath, currentLocale),
        });
      }

      if (addAlternateLinks) {
        // Alternate links for each locale
        for (const locale of locales) {
          const altLocaleInfo = localeObjects[locale] || { code: locale };
          link.push({
            rel: "alternate",
            hreflang: altLocaleInfo.iso || locale,
            href: buildLocalizedUrl(baseUrl, cleanPath, locale),
          });
        }

        // x-default link (points to default locale)
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

  // Apply head configuration
  useHead(headConfig as ComputedRef<Record<string, unknown>>);

  return headConfig;
}
