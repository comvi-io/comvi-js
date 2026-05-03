import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, ref } from "vue";
import * as nuxtAppMocks from "./mocks/nuxt-app";
import { resetComviSetupMock, runComviSetup } from "./mocks/comvi-setup";

const createI18n = vi.fn();

vi.mock("@comvi/vue", () => ({
  createI18n,
}));

function createI18nStub(initialLocale = "en") {
  const listeners = new Map<string, Array<(payload: unknown) => void>>();

  const i18n: any = {
    locale: ref(initialLocale),
    translationCache: computed(() => new Map()),
    isLoading: ref(false),
    isInitializing: ref(false),
    init: vi.fn().mockResolvedValue(undefined),
    use: vi.fn(),
    on: vi.fn((event: string, callback: (payload: unknown) => void) => {
      const callbacks = listeners.get(event) ?? [];
      callbacks.push(callback);
      listeners.set(event, callbacks);
      return () => undefined;
    }),
    setLocale: vi.fn(async (newLocale: string) => {
      i18n.locale.value = newLocale;
    }),
    emit(event: string, payload: unknown) {
      for (const callback of listeners.get(event) ?? []) {
        callback(payload);
      }
    },
  };

  return i18n;
}

function createNuxtAppStub(overrides?: Record<string, unknown>) {
  return {
    vueApp: { use: vi.fn() },
    hook: vi.fn(),
    ...overrides,
  };
}

async function importPlugin() {
  return (await import("../src/runtime/plugin")).default as any;
}

async function flushWatchers() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
}

describe("runtime plugin", () => {
  beforeEach(() => {
    nuxtAppMocks.resetMocks();
    createI18n.mockReset();
    resetComviSetupMock();
  });

  it("bootstraps i18n runtime and provides instance to Nuxt app", async () => {
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    const nuxtApp = createNuxtAppStub();
    const result = await plugin.setup(nuxtApp);

    expect(createI18n).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        fallbackLocale: "en",
        defaultNs: "default",
        ssrLanguage: "en",
      }),
    );
    expect(runComviSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        i18n,
        nuxtApp,
        runtime: "client",
      }),
    );
    expect(runComviSetup.mock.invocationCallOrder[0]).toBeLessThan(
      i18n.init.mock.invocationCallOrder[0],
    );
    expect(i18n.init).toHaveBeenCalledTimes(1);
    expect(nuxtApp.vueApp.use).toHaveBeenCalledWith(i18n);
    expect(result).toEqual({
      provide: {
        i18n,
      },
    });
  });

  it("passes in-context editor key mappings from SSR payload before init", async () => {
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(
      createNuxtAppStub({
        payload: {
          state: {
            __comvi_ice_mappings__: {
              "default:rich_text.user_messages": 42,
            },
          },
        },
      }),
    );

    expect((i18n as any).__comviInContextEditorInitialMappings).toEqual({
      "default:rich_text.user_messages": 42,
    });
    expect(i18n.init).toHaveBeenCalledTimes(1);
  });

  it("still runs setup hook when cdnUrl is absent", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.cdnUrl = undefined;
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.use).not.toHaveBeenCalled();
    expect(i18n.init).toHaveBeenCalledTimes(1);
  });

  it("syncs localeChanged events to Nuxt locale state and cookie", async () => {
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    i18n.emit("localeChanged", { to: "de" });

    const localeState = nuxtAppMocks.useState<string>("i18n-locale");
    const localeCookie = nuxtAppMocks.useCookie("i18n_locale");
    expect(localeState.value).toBe("de");
    expect(localeCookie.value).toBe("de");
  });

  it("updates i18n locale when locale state changes externally", async () => {
    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    const localeState = nuxtAppMocks.useState<string>("i18n-locale");
    localeState.value = "uk";
    await flushWatchers();

    expect(i18n.setLocale).toHaveBeenCalledWith("uk");
  });

  it("does not trigger duplicate setLocale calls when middleware updates locale state", async () => {
    const i18n = createI18nStub("en");
    i18n.setLocale = vi.fn(async (newLocale: string) => {
      // Simulate async locale switching to mirror real library behavior.
      await Promise.resolve();
      i18n.locale.value = newLocale;
    });
    createI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());
    nuxtAppMocks.setMockI18n(i18n);
    nuxtAppMocks.setMockCookie("i18n_locale", "de");

    const middleware = (await import("../src/runtime/middleware/i18n.global")).default;
    await middleware({
      path: "/about",
      fullPath: "/about",
    } as any);
    await flushWatchers();

    expect(i18n.setLocale).toHaveBeenCalledTimes(1);
    expect(i18n.setLocale).toHaveBeenCalledWith("de");
  });

  it("hydrates translations from SSR payload before init on client", async () => {
    const i18n = createI18nStub("en");
    i18n.addTranslations = vi.fn();
    createI18n.mockReturnValue(i18n);

    const ssrTranslations = {
      "en:default": { greeting: "Hello" },
      "en:common": { save: "Save" },
    };

    const plugin = await importPlugin();
    await plugin.setup(
      createNuxtAppStub({
        payload: {
          __comvi_translations__: ssrTranslations,
        },
      }),
    );

    // addTranslations should be called before init()
    expect(i18n.addTranslations).toHaveBeenCalledWith(ssrTranslations);
    expect(i18n.addTranslations.mock.invocationCallOrder[0]).toBeLessThan(
      i18n.init.mock.invocationCallOrder[0],
    );
  });

  it("skips hydration when payload has no translations", async () => {
    const i18n = createI18nStub("en");
    i18n.addTranslations = vi.fn();
    createI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(i18n.addTranslations).not.toHaveBeenCalled();
  });

  it("does not use cookie composable when browser language detection is disabled", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.detectBrowserLanguage = false;
    const useCookieSpy = vi.spyOn(nuxtAppMocks, "useCookie");

    const i18n = createI18nStub("en");
    createI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(useCookieSpy).not.toHaveBeenCalled();
    useCookieSpy.mockRestore();
  });
});
