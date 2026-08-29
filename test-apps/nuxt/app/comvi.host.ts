import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import type { NuxtHostFactory } from "@comvi/nuxt";

// The generated Nuxt default is deliberately the base host; this app renders ICU
// catalogs and loads them on the server, so it composes both explicitly.
export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).with(loader())) satisfies NuxtHostFactory;
