// Framework size fixture: the Nuxt SERVER graph of @comvi/nuxt 0.8 (for the record, not a
// transfer cost) — the client graph's modules built with `import.meta.server`, plus the
// Nitro utility `useTranslation(event)` and the request-end Nitro plugin.
import plugin from "@comvi/nuxt/runtime/plugin.js";
import middleware from "@comvi/nuxt/runtime/middleware/i18n.global.js";
import { useI18n, useFormat } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { useLocalePath } from "@comvi/nuxt/runtime/composables/useLocalePath.js";
import { useSwitchLocalePath } from "@comvi/nuxt/runtime/composables/useSwitchLocalePath.js";
import { useLocaleHead } from "@comvi/nuxt/runtime/composables/useLocaleHead.js";
import T from "@comvi/nuxt/runtime/components/T.js";
import NuxtLinkLocale from "@comvi/nuxt/runtime/components/NuxtLinkLocale.js";
import { useTranslation } from "@comvi/nuxt/runtime/server/utils/useTranslation.js";
import requestEnd from "@comvi/nuxt/runtime/server/plugins/comvi.js";

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
  useTranslation,
  requestEnd,
);
