// The `createNextI18n(…)` result after N1: `.use(installer)` is the one
// composition verb, and Next's scoped raw-plugin queue — `use(plugin, {
// runtime, environment, lazy, …pluginOptions })` — became the two installers
// `nextPlugin(plugin, {…})` / `nextPluginLazy(load, {…})`.
//
// Every queue-shaped step is wrapped IN PLACE: the plugin expression and the
// options object are the author's own text, `lazy` leaves the options because
// the installer now says it, and an options object that held nothing else
// leaves with it. A bare `.use(Uppercase())` is the unscoped queue and takes
// `nextPlugin(…)` too; a first-party factory with no options takes its own
// lowercase installer (row 3 of the core table); a step that already composes
// an installer — `loader(map)` — is left exactly as written.
import { createNextI18n, loader } from "@comvi/next";
import { FetchLoader } from "@comvi/plugin-fetch-loader";
import { LocaleDetector } from "@comvi/plugin-locale-detector";
import { Analytics, Metrics } from "./analytics";

export const { i18n, routing } = createNextI18n({ locales: ["en", "de"], defaultLocale: "en" })
  .use(loader({ de: async () => ({ default: { hello: "Hallo" } }) }))
  .use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/demo" }))
  .use(Analytics({ id: 1 }))
  .use(LocaleDetector({ order: ["cookie", "navigator"] }), { runtime: "client" })
  .use(Metrics(), { runtime: "server", environment: "production", required: false })
  .use(async () => Metrics(), { runtime: "server", lazy: true })
  .use(async () => ({ default: Analytics() }), { lazy: true })
  .use(
    () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
    { runtime: "client", lazy: true, environment: "development", required: false },
  );
