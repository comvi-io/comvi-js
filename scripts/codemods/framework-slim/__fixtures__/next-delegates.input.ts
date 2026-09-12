// The four scoped delegates — `useClient` / `useServer` / `useClientLazy` /
// `useServerLazy` — are DELETED in 0.5.0 (the 0.6.0 removal was pulled
// forward), so each becomes `.use(nextPlugin(…))` / `.use(nextPluginLazy(…))`
// with its runtime baked into the options: appended, exactly where the
// delegate's own `{ ...options, runtime }` spread put it, so an options object
// the codemod cannot read keeps that spread verbatim.
//
// The STORED result is a receiver too — `nextI18n.useClient(…)` is the shape
// the 0.4 README taught — and so is every binding composed from it.
import { createNextI18n, nextPlugin } from "@comvi/next";
import { Analytics, Metrics, vendor } from "./analytics";

const options = { required: false };

export const nextI18n = createNextI18n({ locales: ["en"], defaultLocale: "en" })
  .useClient(Analytics({ id: 1 }))
  .useServer(Metrics(), { environment: "development" })
  .use(nextPlugin(vendor.Metrics(), { environment: "production" }));

nextI18n.useClientLazy(async () => Metrics());
nextI18n.useServerLazy(async () => ({ default: Analytics() }), { required: false, timeout: 500 });
nextI18n.useServer(Metrics(), options);
nextI18n.useClient(Analytics(), {});

export const composed = nextI18n.useClient(vendor.Metrics());
composed.useServerLazy(
  async () => Metrics(),
);

export const { i18n, routing } = nextI18n;
