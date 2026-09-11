// The raw plugin queue was renamed: `use(plugin, options)` -> `registerPlugin`,
// freeing `use` for the one composition verb (decision E).
//
// On a STORED host that is a rename and nothing more — but only where the
// construction PROVES the receiver has the queue AND the argument is PROVABLY a
// raw plugin. `composed` proves the queue through `plugins()`; `detected`
// proves it through a lowercase plugin installer, which brings the capability
// with it. Both keep their argument, their position and their conditional
// exactly as written.
//
// Four argument shapes are provable, and they are the same four a chained
// `.use` decides on: an Uppercase factory call, `new Uppercase()`, a member
// expression ending in an Uppercase call, and an INLINE function — which needs
// no naming convention at all, because an installer returns the host it was
// given and a literal function cannot.
//
// Two shapes are NOT the queue and are left exactly as written:
// `i18n.use(localeDetector(...))`, an installer the codemod can place, which is
// composition and valid on any host at any time; and `i18n.use(wrapMetrics())`,
// the reader's OWN lowercase installer, which the codemod cannot place. Taking
// the convention at its word there is the point: renaming it would turn working
// 0.5 code into a `registerPlugin` that throws at `init()`, so it is flagged
// instead, with the recipe for the case the convention gets wrong.
import { createI18n } from "@comvi/core";
import { plugins } from "@comvi/core/plugins";
import { localeDetector } from "@comvi/plugin-locale-detector";
import { Analytics, Metrics, vendor, wrapMetrics } from "./analytics";

declare const __DEV__: boolean;

export const composed = createI18n({ locale: "en" }).with(plugins());
composed.use(Analytics({ id: 1 }));
if (__DEV__) composed.use(Metrics());
composed.use(vendor.Metrics());
composed.use((host) => {
  void host.t("ready");
});
composed.use(localeDetector({ order: ["cookie"] }));
composed.use(wrapMetrics());

export const detected = createI18n({ locale: "en" }).use(localeDetector());
detected.use(Metrics());
