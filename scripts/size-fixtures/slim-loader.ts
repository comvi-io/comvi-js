// Size-gate fixture: the composed slim surface — `@comvi/core/slim` plus both
// capability subpaths (`/loader`, `/plugins`). Informational (printed, never
// gated): it exists so the cost of "slim with everything attached" is visible
// next to bare slim, which is what the Phase-7 decomposition trades against.
//
// RETARGETED in framework-slim DX-2 to the `.with(installer)` recipe, because
// the measured recipe must be the DOCUMENTED recipe (fs-p4's rule). This row
// is therefore also where the configured-installer bytes land: `loader()`
// statically references the import-map adapter, so this graph now carries
// `createImportMapLoader` where the `attachLoader` + `registerLoader(fn)`
// form did not. That is the intended trade — `loader()` IS the import-map
// installer; a host that registers a plain `LoaderFn` should compose
// `.with(attachLoader)` instead and pays nothing for the adapter.
import { createI18n } from "@comvi/core/slim";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
})
  .with(loader({ en: async () => ({ greeting: "Hello, {name}!" }) }))
  .with(plugins());

console.log(i18n.t("greeting" as never, { name: "world" } as never));
