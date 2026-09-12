// The `createNextI18n(…)` result shapes the codemod refuses, each its own
// chain, each reported and left byte-identical:
//   • options the codemod cannot read on `.use(plugin, options)` — `lazy` in
//     them decides whether argument 1 is a plugin or a loader;
//   • a `lazy` decided at runtime;
//   • a spread member in the options, which may carry `lazy`;
//   • a delegate handed the key it fixes;
//   • a spread argument: N plugins in one call;
//   • a lowercase callee the codemod cannot place: taken at its word as an
//     installer, flagged, and left as written.
import { createNextI18n } from "@comvi/next";
import { Analytics, Metrics, wrapMetrics } from "./analytics";

declare const isLazy: boolean;
const scoped = { runtime: "client" as const };
const plugins = [Analytics(), Metrics()];

export const a = createNextI18n({ locales: ["en"], defaultLocale: "en" }).use(Analytics(), scoped);
export const b = createNextI18n({ locales: ["en"], defaultLocale: "en" }).use(
  async () => Metrics(),
  { lazy: isLazy },
);
export const c = createNextI18n({ locales: ["en"], defaultLocale: "en" }).use(Metrics(), {
  ...scoped,
});
export const d = createNextI18n({ locales: ["en"], defaultLocale: "en" }).useClient(Metrics(), {
  runtime: "server",
});
export const e = createNextI18n({ locales: ["en"], defaultLocale: "en" }).use(...plugins);
export const f = createNextI18n({ locales: ["en"], defaultLocale: "en" }).use(wrapMetrics());
