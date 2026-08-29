import { describe, it, expectTypeOf } from "vitest";
import type { I18n, I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "@comvi/core";
import type { UseI18nReturn as VueUseI18nReturn, VueI18n } from "@comvi/vue";
import type {
  ModuleOptions,
  NuxtHostFactory as PublicNuxtHostFactory,
  NuxtHostFactoryOptions as PublicNuxtHostFactoryOptions,
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

  it("nuxt's resolved options are what a factory is handed", () => {
    expectTypeOf<NuxtHostFactoryOptions>().toMatchTypeOf<{ locale: string }>();
    expectTypeOf<NuxtHostFactoryOptions["defaultNs"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NuxtHostFactoryOptions["tagInterpolation"]>().toEqualTypeOf<
      { basicHtmlTags?: string[] } | undefined
    >();
  });
});
