import { createI18n, icuCompiler, loader, type NuxtHostFactory } from "@comvi/nuxt/host";

// The generated Nuxt default is deliberately the base host; this app renders ICU
// catalogs and loads them on the server, so it composes both explicitly.
// One specifier, and it is the module itself: `@comvi/nuxt/host` re-exports
// core's installers so this file needs no dependency the app did not install.
export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).use(loader())) satisfies NuxtHostFactory;
