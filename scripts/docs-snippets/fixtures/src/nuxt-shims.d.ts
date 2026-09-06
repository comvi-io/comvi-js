/**
 * Nuxt's auto-imports, as the globals they actually are.
 *
 * `@comvi/nuxt` registers eight composables with `addImports` in
 * `packages/nuxt/src/module.ts`, so in a real Nuxt app `useI18n()` is in scope
 * in every `<script setup>` with no import line — which is exactly why the docs
 * never write one. Without this file every Nuxt fence failed TS2304 on the one
 * symbol the page is about: 7 in `packages/nuxt/README.md`, and 24 more on the
 * site that were papered over with `check=skip:nuxt-auto-imports`.
 *
 * Same class as `import.meta.env`: a global the reader's toolchain provides and
 * the docs project otherwise lacks. Not the same class as an augmented
 * `TranslationKeys` — nothing here changes how another fence typechecks, and it
 * is a root ONLY of projects that import `@comvi/nuxt` or carry a
 * `nuxt.config.ts`, so a React page cannot silently gain Nuxt globals.
 *
 * The types are the REAL ones, borrowed from the installed package rather than
 * restated: `typeof import(...)` means a composable whose signature moves breaks
 * the docs that use it, which is the whole point of the gate. The list is the
 * module's list, in the module's order — keep the two in step.
 *
 * The specifiers carry `.js`. `@comvi/nuxt`'s exports map is
 * `"./runtime/*": "./dist/runtime/*"`, a bare target with no `types` condition,
 * and TypeScript only substitutes a declaration file for a target that names
 * one — so the extensionless form (`@comvi/nuxt/runtime/composables/useI18n`)
 * resolves to nothing and TS2307 is what you get. Verified both ways against a
 * linked SDK root.
 */
declare global {
  const useI18n: typeof import("@comvi/nuxt/runtime/composables/useI18n.js").useI18n;
  const useI18nLoader: typeof import("@comvi/nuxt/runtime/composables/capabilities.js").useI18nLoader;
  const useI18nPlugins: typeof import("@comvi/nuxt/runtime/composables/capabilities.js").useI18nPlugins;
  const useLocaleHead: typeof import("@comvi/nuxt/runtime/composables/useLocaleHead.js").useLocaleHead;
  const useLocalePath: typeof import("@comvi/nuxt/runtime/composables/useLocalePath.js").useLocalePath;
  const useLocaleRoute: typeof import("@comvi/nuxt/runtime/composables/useLocaleRoute.js").useLocaleRoute;
  const useRouteConfig: typeof import("@comvi/nuxt/runtime/composables/useRouteConfig.js").useRouteConfig;
  const useSwitchLocalePath: typeof import("@comvi/nuxt/runtime/composables/useSwitchLocalePath.js").useSwitchLocalePath;

  /**
   * The SERVER utilities, registered by `addServerImportsDir` rather than
   * `addImports` — a whole directory rather than a list, so every export of
   * `runtime/server/utils/` is a global in a Nitro handler. Same status as the
   * composables above and the same reason for being here.
   */
  const useTranslation: typeof import("@comvi/nuxt/runtime/server/utils/useTranslation.js").useTranslation;
  const loadTranslations: typeof import("@comvi/nuxt/runtime/server/utils/loadTranslations.js").loadTranslations;
  const getRequestI18n: typeof import("@comvi/nuxt/runtime/server/utils/request-i18n.js").getRequestI18n;
  const getServerRuntimeConfig: typeof import("@comvi/nuxt/runtime/server/utils/runtime-config.js").getServerRuntimeConfig;

  /** Nuxt's own auto-imports, the handful the corpus's Nuxt fences reach for. */
  const defineNuxtConfig: typeof import("nuxt/config").defineNuxtConfig;
  const useRuntimeConfig: typeof import("nuxt/app").useRuntimeConfig;
  const navigateTo: typeof import("nuxt/app").navigateTo;
  const defineEventHandler: typeof import("h3").defineEventHandler;
  const onMounted: typeof import("vue").onMounted;
  const computed: typeof import("vue").computed;
  const ref: typeof import("vue").ref;
}

export {};
