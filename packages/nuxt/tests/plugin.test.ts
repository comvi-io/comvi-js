import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, nextTick, ref } from "vue";
import { EDITOR_INITIAL_MAPPINGS_GLOBAL, EDITOR_MAPPINGS_GLOBAL } from "@comvi/core/editor-bridge";
import * as nuxtAppMocks from "./mocks/nuxt-app";
import { resetComviSetupMock, runComviSetup } from "./mocks/comvi-setup";

const createComviI18n = vi.fn();

vi.mock("#build/comvi.host", () => ({
  createComviI18n,
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
    reportError: vi.fn(),
    on: vi.fn((event: string, callback: (payload: unknown) => void) => {
      const callbacks = listeners.get(event) ?? [];
      callbacks.push(callback);
      listeners.set(event, callbacks);
      // A real unsubscribe, so releasing the listener is observable.
      return () => {
        const registered = listeners.get(event) ?? [];
        const index = registered.indexOf(callback);
        if (index !== -1) {
          registered.splice(index, 1);
        }
      };
    }),
    destroy: vi.fn(),
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

/** The Nuxt app shape the SSR branch needs: a payload it can write into. */
function createServerNuxtAppStub(payload: Record<string, unknown> = {}) {
  return createNuxtAppStub({ payload });
}

/** The `app:rendered` callback the plugin registered with Nuxt. */
function appRenderedHook(nuxtApp: { hook: ReturnType<typeof vi.fn> }) {
  const registration = nuxtApp.hook.mock.calls.find(([event]) => event === "app:rendered");
  expect(registration).toBeDefined();
  return registration![1] as () => void;
}

/** A host that carries the in-context editor's key-mapping bridge. */
function withEditorMappings(i18n: any, mappings: Record<string, number>) {
  i18n[EDITOR_MAPPINGS_GLOBAL] = {
    getKeyMappings: () => mappings,
    loadKeyMappings: () => undefined,
  };
  return i18n;
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
    createComviI18n.mockReset();
    resetComviSetupMock();
  });

  it("registers as a pre-enforced Nuxt plugin", async () => {
    const plugin = await importPlugin();

    expect(plugin.name).toBe("@comvi/nuxt");
    expect(plugin.enforce).toBe("pre");
  });

  it("bootstraps i18n runtime and provides instance to Nuxt app", async () => {
    (nuxtAppMocks.mockRuntimeConfig.public.comvi as any).defaultParams = {
      formality: "formal",
    };
    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    const nuxtApp = createNuxtAppStub();
    const result = await plugin.setup(nuxtApp);

    expect(createComviI18n).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        fallbackLocale: "en",
        defaultNs: "default",
        defaultParams: { formality: "formal" },
        ssrLocale: "en",
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
    createComviI18n.mockReturnValue(i18n);

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

    expect(i18n[EDITOR_INITIAL_MAPPINGS_GLOBAL]).toEqual({
      "default:rich_text.user_messages": 42,
    });
    expect(i18n.init).toHaveBeenCalledTimes(1);
  });

  it("still runs setup hook when cdnUrl is absent", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.cdnUrl = undefined;
    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(runComviSetup).toHaveBeenCalledTimes(1);
    expect(i18n.use).not.toHaveBeenCalled();
    expect(i18n.init).toHaveBeenCalledTimes(1);
  });

  it("syncs localeChanged events to Nuxt locale state and cookie", async () => {
    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);

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
    createComviI18n.mockReturnValue(i18n);

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
      await Promise.resolve();
      i18n.locale.value = newLocale;
    });
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());
    nuxtAppMocks.setMockI18n(i18n);
    nuxtAppMocks.setMockCookie("i18n_locale", "de");

    const middleware = (await import("../src/runtime/middleware/i18n.global")).default;
    await middleware({
      path: "/",
      fullPath: "/",
    } as any);
    await flushWatchers();

    expect(i18n.setLocale).toHaveBeenCalledTimes(1);
    expect(i18n.setLocale).toHaveBeenCalledWith("de");
  });

  it("preserves the cookie preference when setLocale emits localeChanged during nav", async () => {
    // Regression: middleware must restore cookie "de" after plugin listener briefly overwrites it with "en" on localeChanged.
    const i18n = createI18nStub("de");
    i18n.setLocale = vi.fn(async (newLocale: string) => {
      i18n.locale.value = newLocale;
      i18n.emit("localeChanged", { to: newLocale });
    });
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());
    nuxtAppMocks.setMockI18n(i18n);
    nuxtAppMocks.setMockCookie("i18n_locale", "de");

    const middleware = (await import("../src/runtime/middleware/i18n.global")).default;
    await middleware({ path: "/about", fullPath: "/about" } as any);
    await flushWatchers();

    expect(i18n.setLocale).toHaveBeenCalledWith("en");
    // The user's cookie preference survives the localeChanged clobber.
    const localeCookie = nuxtAppMocks.useCookie("i18n_locale");
    expect(localeCookie.value).toBe("de");
  });

  it("hydrates translations from SSR payload before init on client", async () => {
    const i18n = createI18nStub("en");
    i18n.addTranslations = vi.fn();
    createComviI18n.mockReturnValue(i18n);

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

    expect(i18n.addTranslations).toHaveBeenCalledWith(ssrTranslations);
    expect(i18n.addTranslations.mock.invocationCallOrder[0]).toBeLessThan(
      i18n.init.mock.invocationCallOrder[0],
    );
  });

  it("skips hydration when payload has no translations", async () => {
    const i18n = createI18nStub("en");
    i18n.addTranslations = vi.fn();
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(i18n.addTranslations).not.toHaveBeenCalled();
  });

  it("does not use cookie composable when browser language detection is disabled", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.detectBrowserLanguage = false;
    const useCookieSpy = vi.spyOn(nuxtAppMocks, "useCookie");

    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(useCookieSpy).not.toHaveBeenCalled();
  });

  it("does not create a locale cookie when detection opts out of the cookie", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: false,
    } as never;
    const useCookieSpy = vi.spyOn(nuxtAppMocks, "useCookie");
    createComviI18n.mockReturnValue(createI18nStub("en"));

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(useCookieSpy).not.toHaveBeenCalled();
  });

  it("creates the locale cookie with the attributes the detection config asks for", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: true,
      cookieMaxAge: 600,
      sameSite: "strict",
      domain: ".example.com",
      cookieSecure: false,
    } as never;
    createComviI18n.mockReturnValue(createI18nStub("en"));

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(nuxtAppMocks.getMockCookieOptions("i18n_locale")).toEqual({
      maxAge: 600,
      path: "/",
      sameSite: "strict",
      domain: ".example.com",
      secure: false,
    });
  });

  it("creates a year-long secure lax cookie when detection configures no attributes", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: true,
    } as never;
    createComviI18n.mockReturnValue(createI18nStub("en"));

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(nuxtAppMocks.getMockCookieOptions("i18n_locale")).toEqual({
      maxAge: 31536000,
      path: "/",
      sameSite: "lax",
      domain: undefined,
      secure: true,
    });
  });

  it("forwards the configured basic html tags as tag interpolation options", async () => {
    createComviI18n.mockReturnValue(createI18nStub("en"));

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(createComviI18n).toHaveBeenCalledWith(
      expect.objectContaining({ tagInterpolation: { basicHtmlTags: ["strong", "em"] } }),
    );
  });

  it("registers no SSR payload hook on the client", async () => {
    createComviI18n.mockReturnValue(createI18nStub("en"));

    const plugin = await importPlugin();
    const nuxtApp = createNuxtAppStub();
    await plugin.setup(nuxtApp);

    expect(nuxtApp.hook).not.toHaveBeenCalled();
  });

  it("leaves the editor mappings global unset when the payload carries none", async () => {
    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(EDITOR_INITIAL_MAPPINGS_GLOBAL in i18n).toBe(false);
  });

  it("syncs localeChanged to the locale state when no cookie is configured", async () => {
    nuxtAppMocks.mockRuntimeConfig.public.comvi.detectBrowserLanguage = false;
    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    i18n.emit("localeChanged", { to: "de" });

    expect(nuxtAppMocks.useState<string>("i18n-locale").value).toBe("de");
  });

  it("drops the secure cookie flag in a dev build so localhost HTTP keeps it", async () => {
    vi.stubGlobal("__COMVI_TEST_DEV__", true);
    nuxtAppMocks.mockRuntimeConfig.public.comvi.detectBrowserLanguage = {
      useCookie: true,
      cookieSecure: true,
    } as never;
    createComviI18n.mockReturnValue(createI18nStub("en"));

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(nuxtAppMocks.getMockCookieOptions("i18n_locale")).toMatchObject({ secure: false });
  });

  it("keeps the private api key off the client host", async () => {
    nuxtAppMocks.mockRuntimeConfig.comvi = { apiKey: "server-secret" };
    createComviI18n.mockReturnValue(createI18nStub("en"));

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());

    expect(createComviI18n).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }));
  });

  it("reports a failing comvi.setup hook and refuses to initialize on top of it", async () => {
    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);
    const failure = new Error("loader registration blew up");
    runComviSetup.mockRejectedValue(failure);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const plugin = await importPlugin();

    await expect(plugin.setup(createNuxtAppStub())).rejects.toBe(failure);
    // The original instance, not a re-wrapped copy: the stack has to survive.
    expect(i18n.reportError).toHaveBeenCalledWith(failure, { source: "plugin" });
    expect(i18n.init).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("[@comvi/nuxt] comvi.setup hook failed:", failure);
  });

  it("wraps a non-Error comvi.setup rejection before reporting it", async () => {
    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);
    runComviSetup.mockRejectedValue("loader registration blew up");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const plugin = await importPlugin();

    await expect(plugin.setup(createNuxtAppStub())).rejects.toBe("loader registration blew up");
    expect(i18n.reportError).toHaveBeenCalledWith(new Error("loader registration blew up"), {
      source: "plugin",
    });
  });

  it("releases its listeners and destroys the host when HMR disposes the module", async () => {
    const disposeCallbacks: Array<() => void> = [];
    vi.stubGlobal("__COMVI_TEST_HOT__", {
      dispose: (callback: () => void) => disposeCallbacks.push(callback),
    });
    const i18n = createI18nStub("en");
    createComviI18n.mockReturnValue(i18n);

    const plugin = await importPlugin();
    await plugin.setup(createNuxtAppStub());
    expect(disposeCallbacks).toHaveLength(1);

    disposeCallbacks[0]();

    const localeState = nuxtAppMocks.useState<string>("i18n-locale");
    // The localeChanged listener is gone: an event no longer reaches the state.
    i18n.emit("localeChanged", { to: "de" });
    expect(localeState.value).toBe("en");

    // The state watcher is stopped: an external write no longer reaches the host.
    localeState.value = "uk";
    await flushWatchers();
    expect(i18n.setLocale).not.toHaveBeenCalled();

    expect(i18n.destroy).toHaveBeenCalledTimes(1);
  });

  it("surfaces a host construction failure instead of booting a half-built app", async () => {
    createComviI18n.mockImplementation(() => {
      throw new Error("hostModule factory blew up");
    });

    const plugin = await importPlugin();

    await expect(plugin.setup(createNuxtAppStub())).rejects.toThrow("hostModule factory blew up");
  });

  it("rich translation content with VirtualNode shape survives JSON round-trip hydration", async () => {
    const i18n = createI18nStub("en");
    i18n.addTranslations = vi.fn();
    createComviI18n.mockReturnValue(i18n);

    // Tag interpolation puts { tag, props, children } objects in the cache.
    const virtualNodeTranslation = {
      tag: "strong",
      props: {},
      children: ["important text"],
    };
    const ssrTranslations = {
      "en:default": {
        greeting: "Hello",
        highlighted: virtualNodeTranslation as unknown as string,
      },
    };

    // The structure has to survive the JSON round-trip Nuxt payloads impose.
    const serialized = JSON.parse(JSON.stringify(ssrTranslations));

    const plugin = await importPlugin();
    await plugin.setup(
      createNuxtAppStub({
        payload: {
          __comvi_translations__: serialized,
        },
      }),
    );

    // A literal, not `serialized` itself: comparing the payload to the object the
    // test handed in would pin nothing about surviving the round trip.
    expect(i18n.addTranslations).toHaveBeenCalledWith({
      "en:default": {
        greeting: "Hello",
        highlighted: { tag: "strong", props: {}, children: ["important text"] },
      },
    });
    expect(i18n.addTranslations.mock.invocationCallOrder[0]).toBeLessThan(
      i18n.init.mock.invocationCallOrder[0],
    );
  });

  describe("server rendering", () => {
    beforeEach(() => {
      vi.stubGlobal("__COMVI_TEST_SERVER__", true);
    });

    it("hands the private api key to the host", async () => {
      nuxtAppMocks.mockRuntimeConfig.comvi = { apiKey: "server-secret" };
      createComviI18n.mockReturnValue(createI18nStub("en"));

      const plugin = await importPlugin();
      await plugin.setup(createServerNuxtAppStub());

      expect(createComviI18n).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "server-secret" }),
      );
    });

    it("labels the comvi.setup runtime as server", async () => {
      createComviI18n.mockReturnValue(createI18nStub("en"));

      const plugin = await importPlugin();
      await plugin.setup(createServerNuxtAppStub());

      expect(runComviSetup).toHaveBeenCalledWith(expect.objectContaining({ runtime: "server" }));
    });

    it("serializes the rendered translation cache into the Nuxt payload", async () => {
      const i18n = createI18nStub("en");
      i18n.translationCache = computed(
        () =>
          new Map([
            ["en:default", { greeting: "Hello" }],
            ["en:common", { save: "Save" }],
          ]),
      );
      createComviI18n.mockReturnValue(i18n);

      const plugin = await importPlugin();
      const nuxtApp = createServerNuxtAppStub();
      await plugin.setup(nuxtApp);
      appRenderedHook(nuxtApp)();

      expect(nuxtApp.payload).toEqual({
        __comvi_translations__: {
          "en:default": { greeting: "Hello" },
          "en:common": { save: "Save" },
        },
      });
    });

    it("rewrites null-prototype catalogs as plain objects the payload serializer accepts", async () => {
      const i18n = createI18nStub("en");
      // Core hands out null-prototype catalogs; Nuxt's payload serializer drops them.
      const catalog = Object.assign(Object.create(null), { greeting: "Hello" });
      i18n.translationCache = computed(() => new Map([["en:default", catalog]]));
      createComviI18n.mockReturnValue(i18n);

      const plugin = await importPlugin();
      const nuxtApp = createServerNuxtAppStub();
      await plugin.setup(nuxtApp);
      appRenderedHook(nuxtApp)();

      const payload = nuxtApp.payload.__comvi_translations__ as Record<string, unknown>;
      expect(Object.getPrototypeOf(payload["en:default"])).toBe(Object.prototype);
    });

    it("writes no translations payload when nothing was rendered", async () => {
      createComviI18n.mockReturnValue(createI18nStub("en"));

      const plugin = await importPlugin();
      const nuxtApp = createServerNuxtAppStub();
      await plugin.setup(nuxtApp);
      appRenderedHook(nuxtApp)();

      expect(nuxtApp.payload).toEqual({});
    });

    it("carries the in-context editor key mappings into the payload state", async () => {
      const i18n = withEditorMappings(createI18nStub("en"), { "default:greeting": 7 });
      createComviI18n.mockReturnValue(i18n);

      const plugin = await importPlugin();
      const nuxtApp = createServerNuxtAppStub();
      await plugin.setup(nuxtApp);
      appRenderedHook(nuxtApp)();

      expect(nuxtApp.payload.state).toEqual({
        __comvi_ice_mappings__: { "default:greeting": 7 },
      });
    });

    it("keeps state another plugin already put in the payload", async () => {
      const i18n = withEditorMappings(createI18nStub("en"), { "default:greeting": 7 });
      createComviI18n.mockReturnValue(i18n);

      const plugin = await importPlugin();
      const nuxtApp = createServerNuxtAppStub({ state: { otherPlugin: "keep-me" } });
      await plugin.setup(nuxtApp);
      appRenderedHook(nuxtApp)();

      expect(nuxtApp.payload.state).toEqual({
        otherPlugin: "keep-me",
        __comvi_ice_mappings__: { "default:greeting": 7 },
      });
    });

    it("writes no payload state when the host carries no editor bridge", async () => {
      createComviI18n.mockReturnValue(createI18nStub("en"));

      const plugin = await importPlugin();
      const nuxtApp = createServerNuxtAppStub();
      await plugin.setup(nuxtApp);
      appRenderedHook(nuxtApp)();

      expect(nuxtApp.payload.state).toBeUndefined();
    });

    it("does not hydrate from the payload it is about to write", async () => {
      const i18n = createI18nStub("en");
      i18n.addTranslations = vi.fn();
      createComviI18n.mockReturnValue(i18n);

      const plugin = await importPlugin();
      await plugin.setup(
        createServerNuxtAppStub({ __comvi_translations__: { "en:default": { a: "b" } } }),
      );

      expect(i18n.addTranslations).not.toHaveBeenCalled();
    });
  });
});
