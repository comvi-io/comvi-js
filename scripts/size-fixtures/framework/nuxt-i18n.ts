// Framework size fixture: the `@comvi/nuxt/i18n` subpath — the ONE specifier a Nuxt
// app's `comvi.i18n.ts` names, so the documented composition is followable from
// `pnpm add @comvi/nuxt` alone. This row is what that convenience costs: core's root
// plus its icu, loader, plugins and devtools subpaths, reached through one re-export
// hop instead of four app-declared dependencies.
import {
  attachLoader,
  createI18n,
  definePlugin,
  devtools,
  icuCompiler,
  plugins,
} from "@comvi/nuxt/i18n";

// The user's i18nModule default export, inlined. Loader and plugin host exist
// before the catalog is ingested; discovery attaches last.
const host = createI18n({ locale: "en", compiler: icuCompiler }).use(attachLoader).use(plugins());
host.addMessages({ en: { greeting: "Hello, {name}!" } });
host.use(definePlugin(() => undefined));
host.use(devtools({ exposeGlobal: false }));

console.log(host.t("greeting", { name: "world" }), host.getLoader(), host.instanceId);
