import {
  defineNuxtModule,
  createResolver,
  findPath,
  addPlugin,
  addTemplate,
  addImportsDir,
  addComponent,
  addServerImportsDir,
  addRouteMiddleware,
  extendPages,
} from "@nuxt/kit";
import type { NuxtPage } from "@nuxt/schema";
import type { NuxtI18nOptions, LocaleObject, ResolvedRoutingConfig } from "./types";

/**
 * Default browser language detection options
 */
const DEFAULT_DETECT_BROWSER_LANGUAGE = {
  useCookie: true,
  cookieName: "i18n_locale",
  cookieMaxAge: 365 * 24 * 60 * 60, // 1 year
  redirectOnFirstVisit: true,
};

/**
 * Normalize locale configuration to consistent format
 */
function normalizeLocales(locales: (string | LocaleObject)[]): {
  codes: string[];
  objects: Record<string, LocaleObject>;
} {
  const codes: string[] = [];
  const objects: Record<string, LocaleObject> = {};

  for (const locale of locales) {
    if (typeof locale === "string") {
      codes.push(locale);
      objects[locale] = { code: locale };
    } else {
      codes.push(locale.code);
      objects[locale.code] = locale;
    }
  }

  return { codes, objects };
}

/**
 * Detect routes that use the dedicated `:locale` dynamic param segment.
 * Must not match params like `:localeId`.
 */
function isLocaleParamRoute(path: string): boolean {
  return /(?:^|\/):locale(?:$|[/?+*()])/u.test(path);
}

export default defineNuxtModule<NuxtI18nOptions>({
  meta: {
    name: "@comvi/nuxt",
    configKey: "comvi",
    compatibility: {
      nuxt: "^3.0.0",
    },
  },

  defaults: {
    locales: [],
    defaultLocale: "en",
    localePrefix: "as-needed",
    defaultNs: "default",
    detectBrowserLanguage: DEFAULT_DETECT_BROWSER_LANGUAGE,
  },

  async setup(options, nuxt) {
    // Validate required options
    if (!options.locales || options.locales.length === 0) {
      console.warn(
        "[@comvi/nuxt] No locales configured. Add locales to your nuxt.config.ts comvi options.",
      );
    }

    const { resolve } = createResolver(import.meta.url);
    let resolvedSetupPath: string | undefined;

    if (options.setup) {
      try {
        resolvedSetupPath =
          (await findPath(options.setup, {
            cwd: nuxt.options.rootDir,
            type: "file",
          })) ?? undefined;
      } catch {
        resolvedSetupPath = undefined;
      }

      if (!resolvedSetupPath) {
        throw new Error(`[@comvi/nuxt] Failed to resolve comvi.setup path: "${options.setup}".`);
      }
    } else {
      try {
        resolvedSetupPath =
          (await findPath("./comvi.setup", {
            cwd: nuxt.options.rootDir,
            type: "file",
          })) ?? undefined;
      } catch {
        resolvedSetupPath = undefined;
      }
    }

    // Normalize locale configuration
    const { codes: localeCodes, objects: localeObjects } = normalizeLocales(options.locales);

    const existingPublicRuntimeConfig = nuxt.options.runtimeConfig.public.comvi ?? {};
    const detectBrowserLanguageSource =
      existingPublicRuntimeConfig.detectBrowserLanguage ?? options.detectBrowserLanguage;

    // Resolve detection options
    const detectBrowserLanguage =
      detectBrowserLanguageSource === false
        ? false
        : {
            ...DEFAULT_DETECT_BROWSER_LANGUAGE,
            ...(typeof detectBrowserLanguageSource === "object" ? detectBrowserLanguageSource : {}),
          };

    // Cookie name for locale storage
    const cookieName =
      typeof detectBrowserLanguage === "object"
        ? detectBrowserLanguage.cookieName
        : DEFAULT_DETECT_BROWSER_LANGUAGE.cookieName;

    // Build routing config
    const routingConfig: ResolvedRoutingConfig = {
      locales: localeCodes,
      localeObjects,
      defaultLocale: options.defaultLocale,
      localePrefix: options.localePrefix ?? "as-needed",
      cookieName,
    };

    // Add runtime config (public)
    nuxt.options.runtimeConfig.public.comvi = {
      ...existingPublicRuntimeConfig,
      locales: localeCodes,
      localeObjects,
      defaultLocale: options.defaultLocale,
      localePrefix: options.localePrefix ?? "as-needed",
      cookieName,
      cdnUrl: existingPublicRuntimeConfig.cdnUrl ?? options.cdnUrl,
      apiBaseUrl: existingPublicRuntimeConfig.apiBaseUrl ?? options.apiBaseUrl,
      defaultNs: existingPublicRuntimeConfig.defaultNs ?? options.defaultNs ?? "default",
      fallbackLanguage:
        existingPublicRuntimeConfig.fallbackLanguage ??
        options.fallbackLanguage ??
        options.defaultLocale,
      basicHtmlTags: existingPublicRuntimeConfig.basicHtmlTags ?? options.basicHtmlTags,
      detectBrowserLanguage,
    };

    // Add private runtime config (server-only)
    nuxt.options.runtimeConfig.comvi = {
      ...(nuxt.options.runtimeConfig.comvi ?? {}),
      ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
    };

    // Provide routing config to templates
    nuxt.options.appConfig.comvi = {
      routing: routingConfig,
    };

    // Add runtime plugin
    addPlugin({
      src: resolve("./runtime/plugin"),
      mode: "all",
    });

    // Generate runtime bridge for user setup hook
    addTemplate({
      filename: "comvi.setup.mjs",
      getContents: () => {
        const setupPath = resolvedSetupPath;

        if (!setupPath) {
          return `
export async function runComviSetup() {}
`;
        }

        return `
import userSetup from ${JSON.stringify(setupPath)};

export async function runComviSetup(context) {
  if (typeof userSetup !== "function") {
    throw new TypeError(
      "[@comvi/nuxt] comvi.setup must export a default function.",
    );
  }

  await userSetup(context);
}
`;
      },
    });

    // Add composables
    addImportsDir(resolve("./runtime/composables"));

    // Register runtime components explicitly to avoid async/global component chunk warnings.
    addComponent({
      name: "T",
      filePath: resolve("./runtime/components/T"),
      export: "default",
    });
    addComponent({
      name: "NuxtLinkLocale",
      filePath: resolve("./runtime/components/NuxtLinkLocale"),
      export: "default",
    });

    // Add server utilities
    addServerImportsDir(resolve("./runtime/server/utils"));

    // Add route middleware for locale detection
    addRouteMiddleware({
      name: "i18n",
      path: resolve("./runtime/middleware/i18n.global"),
      global: true,
    });

    // Transpile runtime
    nuxt.options.build.transpile.push(resolve("./runtime"));

    // Add @comvi/vue and @comvi/core to transpile
    nuxt.options.build.transpile.push("@comvi/vue", "@comvi/core");

    // Optimize dependencies
    nuxt.options.vite = nuxt.options.vite || {};
    nuxt.options.vite.optimizeDeps = nuxt.options.vite.optimizeDeps || {};
    nuxt.options.vite.optimizeDeps.include = nuxt.options.vite.optimizeDeps.include || [];
    nuxt.options.vite.optimizeDeps.include.push("@comvi/vue", "@comvi/core");

    // Extend pages to create locale-prefixed routes
    const localePrefix = options.localePrefix ?? "as-needed";
    const defaultLocale = options.defaultLocale;

    if (localePrefix !== "never") {
      extendPages((pages) => {
        const localizedPages: NuxtPage[] = [];

        const withLocalePrefix = (path: string, locale: string): string => {
          if (path === "/") {
            return `/${locale}`;
          }
          // Child route paths are often relative (e.g. "settings").
          // Only absolute route paths should get locale prefixes.
          if (path.startsWith("/")) {
            return `/${locale}${path}`;
          }
          return path;
        };

        // Helper to clone a page with a new path
        const clonePageWithPrefix = (page: NuxtPage, locale: string): NuxtPage => {
          return {
            ...page,
            path: withLocalePrefix(page.path, locale),
            name: page.name ? `${page.name}___${locale}` : undefined,
            children: page.children?.map((child) => clonePageWithPrefix(child, locale)),
          };
        };

        // Filter out pages inside [locale] folder (handled differently)
        const rootPages = pages.filter(
          (page) => !isLocaleParamRoute(page.path) && !page.file?.includes("[locale]"),
        );

        for (const locale of localeCodes) {
          // For 'always' mode: prefix all locales including default
          // For 'as-needed' mode: only prefix non-default locales
          const shouldPrefix =
            localePrefix === "always" || (localePrefix === "as-needed" && locale !== defaultLocale);

          if (shouldPrefix) {
            for (const page of rootPages) {
              localizedPages.push(clonePageWithPrefix(page, locale));
            }
          }
        }

        // Add localized pages
        pages.push(...localizedPages);

        if (localePrefix === "always" && rootPages.length > 0) {
          // Remove unprefixed routes - only prefixed routes should exist
          for (let i = pages.length - 1; i >= 0; i--) {
            if (rootPages.includes(pages[i])) {
              pages.splice(i, 1);
            }
          }
        }

        // Remove [locale] dynamic routes if they exist (we're handling routing differently)
        const localeRouteIndex = pages.findIndex(
          (page) => isLocaleParamRoute(page.path) || page.file?.includes("[locale]"),
        );
        if (localeRouteIndex !== -1) {
          // Remove all [locale] routes
          for (let i = pages.length - 1; i >= 0; i--) {
            if (isLocaleParamRoute(pages[i].path) || pages[i].file?.includes("[locale]")) {
              pages.splice(i, 1);
            }
          }
        }
      });
    }
  },
});
