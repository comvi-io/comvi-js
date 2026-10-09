import { describe, it, expectTypeOf } from "vitest";
import type {
  I18n,
  I18nLoaderApi,
  I18nPluginApi,
  LoaderFn,
  MessageCompiler,
  WrapperI18nInstance,
} from "@comvi/core";
import type { UseI18nReturn as VueUseI18nReturn, VueI18n } from "@comvi/vue";
import type {
  CheckedNuxtI18nSetup as PublicCheckedNuxtI18nSetup,
  I18nLoaderApi as PublicI18nLoaderApi,
  LoaderFn as PublicLoaderFn,
  ModuleOptions,
  NuxtInstanceFactory as PublicNuxtInstanceFactory,
  NuxtInstanceFactoryOptions as PublicNuxtInstanceFactoryOptions,
  NuxtI18nSetup as PublicNuxtI18nSetup,
} from "@comvi/nuxt";
import type { UseI18nReturn as NuxtUseI18nReturn } from "../src/runtime/composables/useI18n";
import { attachLoader, createI18n, defineComviHost } from "../src/runtime/host";
import type {
  CheckedNuxtI18nSetup,
  NuxtInstanceFactory,
  NuxtInstanceFactoryOptions,
  NuxtI18nOptions,
  NuxtI18nSetup,
  NuxtI18nSetupContext,
  NuxtServerInstance,
  NuxtServerLoaderInstance,
  ResolvedNuxtInstance,
} from "../src/types";

describe("UseI18nReturn type parity", () => {
  it("Nuxt UseI18nReturn structurally extends Vue UseI18nReturn", () => {
    expectTypeOf<NuxtUseI18nReturn>().toMatchTypeOf<VueUseI18nReturn>();
  });
});

describe("published package-root types", () => {
  it("exports both module options and the custom host factory vocabulary", () => {
    expectTypeOf<ModuleOptions>().toMatchTypeOf<Partial<NuxtI18nOptions>>();
    expectTypeOf<PublicNuxtInstanceFactoryOptions>().toMatchTypeOf<{ locale: string }>();
    expectTypeOf<PublicNuxtInstanceFactory>().toBeFunction();
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
    expectTypeOf<PublicNuxtInstanceFactoryOptions["compiler"]>().toEqualTypeOf<
      MessageCompiler | undefined
    >();
  });
});

type FactoryDefaults = { tenant: string };
export const publicFactoryWithDefaults: PublicNuxtInstanceFactory<
  WrapperI18nInstance<FactoryDefaults>,
  FactoryDefaults
> = (options) => {
  expectTypeOf(options.defaultParams.tenant).toEqualTypeOf<string>();
  return {} as WrapperI18nInstance<FactoryDefaults>;
};

describe("host vocabulary after the single-entry convergence", () => {
  it("NuxtServerInstance is the BASE host, with no capability folded in", () => {
    // The generated default template builds this, so claiming more here would
    // make every server utility type-check against a host that does not exist.
    expectTypeOf<NuxtServerInstance>().toEqualTypeOf<WrapperI18nInstance>();
    expectTypeOf<I18n>().toMatchTypeOf<NuxtServerInstance>();
    expectTypeOf<NuxtServerInstance>().not.toMatchTypeOf<I18nLoaderApi>();
    expectTypeOf<NuxtServerInstance>().not.toMatchTypeOf<I18nPluginApi>();
  });

  it("NuxtServerLoaderInstance is the composed shape SSR loading needs", () => {
    expectTypeOf<NuxtServerLoaderInstance>().toMatchTypeOf<NuxtServerInstance>();
    expectTypeOf<NuxtServerLoaderInstance>().toMatchTypeOf<I18nLoaderApi>();
    expectTypeOf<NuxtServerInstance>().not.toMatchTypeOf<NuxtServerLoaderInstance>();
  });

  it("NuxtInstanceFactory carries the composed host type through to the setup hook", () => {
    const composed = (options: NuxtInstanceFactoryOptions) =>
      ({ locale: options.locale }) as unknown as I18n & I18nLoaderApi;

    expectTypeOf(composed).toMatchTypeOf<NuxtInstanceFactory<I18n & I18nLoaderApi>>();
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
    expectTypeOf<NuxtInstanceFactoryOptions>().toMatchTypeOf<{ locale: string }>();
    expectTypeOf<NuxtInstanceFactoryOptions["defaultNs"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<NuxtInstanceFactoryOptions["tagInterpolation"]>().toEqualTypeOf<
      { basicHtmlTags?: string[] } | undefined
    >();
  });
});

// `comvi.setup`'s host type was an unverified ASSERTION about a different file
// reached by a string path: `NuxtI18nSetup<I18n & I18nLoaderApi>` compiled
// whether or not `comvi.host` composed the loader, and a base host gets no
// capability shim, so `core.registerLoader(...)` threw a raw `TypeError` on the
// first call. `CheckedNuxtI18nSetup` is the constraint the module's generated
// `types/comvi-host.ts` applies to close that gap; these are both of its
// directions, on the exact shapes codegen passes it.
type LoaderHook = (context: NuxtI18nSetupContext<I18n & I18nLoaderApi>) => void;

/** A factory that composed `loader(map)`: the hook's claim is true. */
export type SetupAgainstComposedLoader = CheckedNuxtI18nSetup<I18n & I18nLoaderApi, LoaderHook>;

/** The published constraint is the same one, so an app gets this check too. */
export type PublicSetupAgainstComposedLoader = PublicCheckedNuxtI18nSetup<
  I18n & PublicI18nLoaderApi,
  LoaderHook
>;

/** A factory that composed the PLUGIN host instead — a capability mismatch. */
export type SetupAgainstPluginsOnlyInstance = CheckedNuxtI18nSetup<
  I18n & I18nPluginApi,
  // @ts-expect-error the hook names a loader this factory never composed
  LoaderHook
>;

/** The no-`hostModule` branch: core's BASE host, so every capability is absent. */
export type SetupAgainstDefaultBranch = CheckedNuxtI18nSetup<
  ResolvedNuxtInstance,
  // @ts-expect-error a base host has no loader, and this is the whole U4 defect
  LoaderHook
>;

describe("the comvi.setup host cross-check", () => {
  it("hands the check back the hook it was given when the host matches", () => {
    expectTypeOf<SetupAgainstComposedLoader>().toEqualTypeOf<LoaderHook>();
    expectTypeOf<PublicSetupAgainstComposedLoader>().toEqualTypeOf<LoaderHook>();
  });

  it("resolves to core's BASE host with no generated declaration in the program", () => {
    // This package compiles without any app, and `ComviNuxtInstanceRegistry` is
    // empty here; an app's generated `types/comvi-host.ts` augments it with
    // `ReturnType<typeof import("./comvi.host").default>`.
    expectTypeOf<ResolvedNuxtInstance>().toEqualTypeOf<I18n>();
    expectTypeOf<Parameters<NuxtI18nSetup>[0]["core"]>().toEqualTypeOf<ResolvedNuxtInstance>();
  });

  it("accepts a hook written with no type argument at all", () => {
    // The recommended shape after U4: no host named by hand, so nothing to
    // verify — the default type argument IS the factory's return type inside an
    // app, and the base host here.
    const hook = (({ core }) => {
      core.t("greeting");
    }) satisfies NuxtI18nSetup;
    expectTypeOf(hook).toBeFunction();
  });
});

describe("defineComviHost", () => {
  // The helper replaces `satisfies NuxtInstanceFactory`: `options` is typed from it
  // and the factory comes back unchanged, so the generated declaration's
  // `ReturnType<typeof import("./comvi.host").default>` still reads the
  // composed host and the setup hook still sees its capabilities.
  const composedHost = defineComviHost((options) => {
    expectTypeOf(options).toEqualTypeOf<NuxtInstanceFactoryOptions>();
    return createI18n(options).use(attachLoader);
  });

  it("keeps the composed host as the factory's return type", () => {
    expectTypeOf<ReturnType<typeof composedHost>>().toMatchTypeOf<I18n & I18nLoaderApi>();
    expectTypeOf(composedHost).toMatchTypeOf<
      NuxtInstanceFactory<ReturnType<typeof composedHost>>
    >();
    expectTypeOf<
      CheckedNuxtI18nSetup<ReturnType<typeof composedHost>, NuxtI18nSetup<I18n & I18nLoaderApi>>
    >().toEqualTypeOf<NuxtI18nSetup<I18n & I18nLoaderApi>>();
  });

  it("rejects a factory that does not return a host", () => {
    // @ts-expect-error a number is not an i18n host
    defineComviHost(() => 42);
  });
});
