// The raw plugin queue was renamed: `use(plugin, options)` -> `registerPlugin`,
// freeing `use` for the one composition verb (decision E).
//
// On a STORED host that is a rename and nothing more — but only where the
// construction PROVES the receiver has the queue. `composed` does, through
// `plugins()`; `detected` does, through a lowercase plugin installer, which
// brings the capability with it. Both keep their argument, their position and
// their conditional exactly as written.
//
// `i18n.use(localeDetector(...))` on the same binding is NOT the queue: an
// installer in the slot is composition, valid on any host at any time, and
// renaming it would break it.
import { createI18n } from "@comvi/core";
import { plugins } from "@comvi/core/plugins";
import { localeDetector } from "@comvi/plugin-locale-detector";
import { Analytics, Metrics } from "./analytics";

declare const __DEV__: boolean;

export const composed = createI18n({ locale: "en" }).use(plugins());
composed.registerPlugin(Analytics({ id: 1 }));
if (__DEV__) composed.registerPlugin(Metrics());
composed.use(localeDetector({ order: ["cookie"] }));

export const detected = createI18n({ locale: "en" }).use(localeDetector());
detected.registerPlugin(Metrics());
