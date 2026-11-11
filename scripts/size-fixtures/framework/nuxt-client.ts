// Framework size fixture: the Nuxt CLIENT graph of @comvi/nuxt 0.8 — the plugin (the
// instance from the server's snapshot), the route middleware, the auto-imported
// composables a page calls (`useI18n`, `useFormat`, the routing ones) and the
// components (`<T>`, `<NuxtLinkLocale>`), on @comvi/vue and @comvi/core.
import plugin from "@comvi/nuxt/runtime/plugin.js";
import middleware from "@comvi/nuxt/runtime/middleware/i18n.global.js";
import { useI18n, useFormat } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { useLocalePath } from "@comvi/nuxt/runtime/composables/useLocalePath.js";
import { useSwitchLocalePath } from "@comvi/nuxt/runtime/composables/useSwitchLocalePath.js";
import { useLocaleHead } from "@comvi/nuxt/runtime/composables/useLocaleHead.js";
import T from "@comvi/nuxt/runtime/components/T.js";
import NuxtLinkLocale from "@comvi/nuxt/runtime/components/NuxtLinkLocale.js";

console.log(
  plugin,
  middleware,
  useI18n,
  useFormat,
  useLocalePath,
  useSwitchLocalePath,
  useLocaleHead,
  T,
  NuxtLinkLocale,
);
