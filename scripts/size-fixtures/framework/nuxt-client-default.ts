// Framework size fixture (single-entry P4): THE DEFAULT nuxt CLIENT graph —
// the runtime plugin and the `useI18n` composable on the host the generated
// `#build/comvi.host` template builds when `hostModule` is unset. That host is
// core's BASE host: text + `{param}`, the cache, events and default params.
//
// RETARGETED from `nuxt-client-slim.ts`, which measured the `hostModule`
// branch on a bare host. It no longer needs its own row: since the
// convergence the DEFAULT branch builds exactly that host, so the bare-host
// client price IS the default client price and one row states it.
//
// No server loader is in this graph on purpose. Nuxt's SSR pass loads and
// serializes; the client hydrates the payload through `addTranslations`, which
// is a base-host member — that is why a client-only nuxt app pays nothing for
// the loader capability.
//
// The template is a nuxt virtual module (external here, like #app), so the
// fixture carries the branch's own import itself; leaving it out would measure
// a nuxt app with no i18n host at all. `createComviCore` is unreachable from a
// client entry, so core's own constructor import is not carried here — vue's
// `createI18n` is what reaches core's class on this path.
//
// The four capability subpaths and core's tag-registration pair are
// sentinel-asserted ABSENT: the default nuxt host composes nothing, and the
// module injects nothing on the app's behalf. Core's BASE entry is present by
// construction and is deliberately not a sentinel.
import plugin from "@comvi/nuxt/runtime/plugin.js";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { createI18n } from "@comvi/vue";

// Template default branch, client half: `createComviI18n`.
const i18n = createI18n({ locale: "en", ssrLocale: "en" });

// Hydration path: the SSR-serialized catalog arrives as plain data.
i18n.addTranslations({ en: { greeting: "Hello, {name}!" } } as never);

console.log(plugin, useI18n, i18n.t("greeting" as never, { name: "world" } as never));
