import { useHead, useRuntimeConfig, useRoute, useRequestURL } from "#app";
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

    const htmlAttrs: Record<string, string> = {};
    if (addLang) {
      htmlAttrs.lang = localeObj?.iso || currentLocale;
    }
    if (addDir && localeObj?.dir) {
      htmlAttrs.dir = localeObj.dir;
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
