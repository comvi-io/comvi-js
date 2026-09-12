import { describe, it, expectTypeOf } from "vitest";
import type {
  I18n,
  I18nLoaderApi,
  I18nPluginHostApi,
  LoaderFn,
  MessageCompiler,
  WrapperI18nHost,
} from "@comvi/core";
import type { UseI18nReturn as VueUseI18nReturn, VueI18n } from "@comvi/vue";
import type {
  I18nLoaderApi as PublicI18nLoaderApi,
  LoaderFn as PublicLoaderFn,
  ModuleOptions,
  NuxtHostFactory as PublicNuxtHostFactory,
  NuxtHostFactoryOptions as PublicNuxtHostFactoryOptions,
  NuxtI18nSetup as PublicNuxtI18nSetup,
} from "@comvi/nuxt";
import type { UseI18nReturn as NuxtUseI18nReturn } from "../src/runtime/composables/useI18n";
import type {
  NuxtHostFactory,
  NuxtHostFactoryOptions,
  NuxtI18nOptions,
  NuxtI18nSetup,
  NuxtServerHost,
  NuxtServerLoaderHost,
} from "../src/types";

describe("UseI18nReturn type parity", () => {
  it("Nuxt UseI18nReturn structurally extends Vue UseI18nReturn", () => {
    expectTypeOf<NuxtUseI18nReturn>().toMatchTypeOf<VueUseI18nReturn>();
  });
});

describe("published package-root types", () => {
  it("exports both module options and the custom host factory vocabulary", () => {
    expectTypeOf<ModuleOptions>().toMatchTypeOf<Partial<NuxtI18nOptions>>();
    expectTypeOf<PublicNuxtHostFactoryOptions>().toMatchTypeOf<{ locale: string }>();
    expectTypeOf<PublicNuxtHostFactory>().toBeFunction();
  });

  it("carries the loader types a typed comvi.setup hook needs, from one specifier", () => {
    // `@comvi/core` is this package's dependency, not the app's: a hook typed
    // `NuxtI18nSetup<I18n & I18nLoaderApi>` must be able to name all three from
    // `@comvi/nuxt` alone.
    expectTypeOf<PublicI18nLoaderApi>().toEqualTypeOf<I18nLoaderApi>();
    expectTypeOf<PublicLoaderFn>().toEqualTypeOf<LoaderFn>();
    const hook = (({ core }) => {
      core.registerLoader(async () => ({}));
    }) satisfies PublicNuxtI18nSetup<I18n & PublicI18nLoaderApi>;
    expectTypeOf(hook).toBeFunction();
  });

  it("names the compiler a factory receives when comvi.icu is on", () => {
    expectTypeOf<PublicNuxtHostFactoryOptions["compiler"]>().toEqualTypeOf<
      MessageCompiler | undefined
    >();
  });
});

type FactoryDefaults = { tenant: string };
export const publicFactoryWithDefaults: PublicNuxtHostFactory<
  WrapperI18nHost<FactoryDefaults>,
  FactoryDefaults
> = (options) => {
  expectTypeOf(options.defaultParams.tenant).toEqualTypeOf<string>();
  return {} as WrapperI18nHost<FactoryDefaults>;
};

describe("host vocabulary after the single-entry convergence", () => {
  it("NuxtServerHost is the BASE host, with no capability folded in", () => {
    // The generated default template builds this, so claiming more here would
    // make every server utility type-check against a host that does not exist.
    expectTypeOf<NuxtServerHost>().toEqualTypeOf<WrapperI18nHost>();
    expectTypeOf<I18n>().toMatchTypeOf<NuxtServerHost>();
    expectTypeOf<NuxtServerHost>().not.toMatchTypeOf<I18nLoaderApi>();
    expectTypeOf<NuxtServerHost>().not.toMatchTypeOf<I18nPluginHostApi>();
  });

  it("NuxtServerLoaderHost is the composed shape SSR loading needs", () => {
    expectTypeOf<NuxtServerLoaderHost>().toMatchTypeOf<NuxtServerHost>();
    expectTypeOf<NuxtServerLoaderHost>().toMatchTypeOf<I18nLoaderApi>();
    expectTypeOf<NuxtServerHost>().not.toMatchTypeOf<NuxtServerLoaderHost>();
  });

  it("NuxtHostFactory carries the composed host type through to the setup hook", () => {
    const composed = (options: NuxtHostFactoryOptions) =>
      ({ locale: options.locale }) as unknown as I18n & I18nLoaderApi;

    expectTypeOf(composed).toMatchTypeOf<NuxtHostFactory<I18n & I18nLoaderApi>>();
    // …and that same host type is what makes the hook see the capability, on
    // both sides of the context union (VueI18n in the app plugin, the host
    // itself in the server utilities).
    expectTypeOf<Parameters<NuxtI18nSetup<I18n & I18nLoaderApi>>[0]["i18n"]>().toEqualTypeOf<
      VueI18n<{}, I18n & I18nLoaderApi> | (I18n & I18nLoaderApi)
    >();
  });

  it("the setup context carries the composed host as `core`, needing no narrowing", () => {
    // `i18n` is a union (VueI18n in the app plugin, the host itself in a
    // server utility), so every capability call used to need `'core' in i18n`
    // first. `core` is always the host.
    expectTypeOf<Parameters<NuxtI18nSetup<I18n & I18nLoaderApi>>[0]["core"]>().toEqualTypeOf<
      I18n & I18nLoaderApi
    >();
  });

  it("nuxt's resolved options are what a factory is handed", () => {
    expectTypeOf<NuxtHostFactoryOptions>().toMatchTypeOf<{ locale: string }>();
    expectTypeOf<NuxtHostFactoryOptions["defaultNs"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NuxtHostFactoryOptions["tagInterpolation"]>().toEqualTypeOf<
      { basicHtmlTags?: string[] } | undefined
    >();
  });
});
