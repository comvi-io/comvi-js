import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { createI18n } from "@comvi/core";
import { prepareTranslation } from "@comvi/core/rich-text";
import type { PrepareTranslationSource } from "@comvi/core/rich-text";
import { getRequestI18n } from "../src/runtime/server/utils/request-i18n";
import { createComviCore, resetComviHostMock } from "./mocks/comvi-host";
import { resetComviSetupMock, runComviSetup } from "./mocks/comvi-setup";
import { nodeResponseStub } from "./mocks/node-response";

/** Only the runtime-config slice `getRequestI18n` reads. */
type ComviPublic = Record<string, unknown>;

function createContext(comvi: ComviPublic = {}, privateComvi: unknown = {}) {
  return {
    runtimeConfig: {
      public: {
        comvi: { defaultLocale: "en", fallbackLocale: "en", defaultNs: "common", ...comvi },
      },
      comvi: privateComvi,
    },
  };
}

// h3 1.x always gives an event a node response, so a hand-made one carries the
// stub — `getRequestI18n` hangs its cleanup hook off it.
const eventFor = (context: unknown) =>
  ({ context, node: { res: nodeResponseStub() } }) as unknown as H3Event;

const createEvent = (comvi: ComviPublic = {}, privateComvi: unknown = {}) =>
  eventFor(createContext(comvi, privateComvi));

function createHost(locale = "en") {
  const host = {
    locale,
    init: vi.fn().mockResolvedValue(undefined),
    setLocale: vi.fn(async (next: string) => {
      host.locale = next;
    }),
  };
  return host;
}

/** Records every write to `locale` so "corrected only when needed" is observable. */
function createHostWithLocaleWrites(locale = "en") {
  const host = createHost(locale);
  const writes: string[] = [];
  let current = locale;
  Object.defineProperty(host, "locale", {
    get: () => current,
    set: (next: string) => {
      writes.push(next);
      current = next;
    },
  });
  return { host, writes };
}

describe("getRequestI18n", () => {
  beforeEach(() => {
    resetComviHostMock();
    resetComviSetupMock();
  });

  describe("request cache key", () => {
    it("keys the cache on the event context, so two events sharing a context share one host", async () => {
      const host = createHost();
      createComviCore.mockReturnValue(host);
      const context = createContext();

      const first = await getRequestI18n(eventFor(context), "en");
      const second = await getRequestI18n(eventFor(context), "en");

      expect(second).toBe(first);
      expect(createComviCore).toHaveBeenCalledTimes(1);
    });

    it("keys the cache on the event itself when the event carries no context", async () => {
      const host = createHost();
      createComviCore.mockReturnValue(host);
      const event = eventFor(undefined);

      const first = await getRequestI18n(event, "en");
      const second = await getRequestI18n(event, "en");

      expect(second).toBe(first);
      expect(createComviCore).toHaveBeenCalledTimes(1);
    });

    it("refuses a non-object context as a cache key and falls back to the event", async () => {
      const host = createHost();
      createComviCore.mockReturnValue(host);
      const event = eventFor("request-scope");

      const first = await getRequestI18n(event, "en");
      const second = await getRequestI18n(event, "en");

      expect(second).toBe(first);
      expect(createComviCore).toHaveBeenCalledTimes(1);
    });

    it("treats a null context as absent instead of using it as a cache key", async () => {
      const host = createHost();
      createComviCore.mockReturnValue(host);
      const event = eventFor(null);

      await expect(getRequestI18n(event, "en")).resolves.toBe(host);
    });
  });

  describe("host construction options", () => {
    it("builds the host with the request locale and the resolved catalogue options", async () => {
      const host = createHost();
      createComviCore.mockReturnValue(host);

      await getRequestI18n(createEvent({}, { apiKey: "secret" }), "de");

      expect(createComviCore).toHaveBeenCalledWith({
        locale: "de",
        fallbackLocale: "en",
        defaultNs: "common",
        devMode: false,
        apiKey: "secret",
        translation: undefined,
        tagInterpolation: undefined,
      });
    });

    it("forwards comvi.ns into each request host's options, as the app plugin does", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent({ ns: ["common", "nav"] }), "de");

      expect(createComviCore).toHaveBeenCalledWith(
        expect.objectContaining({ ns: ["common", "nav"] }),
      );
    });

    it("drops the empty string runtime config makes of an unset ns", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent({ ns: "" }), "de");

      expect(createComviCore.mock.calls[0]?.[0]?.ns).toBeUndefined();
    });

    it("forwards tagInterpolation from basicHtmlTags, exactly as the app plugin does", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent({ basicHtmlTags: ["b", "i"] }, { apiKey: "secret" }), "de");

      expect(createComviCore).toHaveBeenCalledWith({
        locale: "de",
        fallbackLocale: "en",
        defaultNs: "common",
        devMode: false,
        apiKey: "secret",
        translation: undefined,
        tagInterpolation: { basicHtmlTags: ["b", "i"] },
      });
    });

    it("keeps a whitelisted element in rich text rendered off the request host", async () => {
      createComviCore.mockImplementation((options: Record<string, unknown>) =>
        createI18n({
          ...options,
          translation: { "en:common": { hi: "Hello <b>world</b>" } },
        } as unknown as Parameters<typeof createI18n>[0]),
      );

      const host = await getRequestI18n(createEvent({ basicHtmlTags: ["b"] }), "en");
      const prepared = prepareTranslation(host as unknown as PrepareTranslationSource, {
        i18nKey: "hi",
      });

      expect(prepared.content).toEqual([
        "Hello ",
        expect.objectContaining({ type: "element", tag: "b", children: ["world"] }),
      ]);
    });

    it("renders a key from comvi.translation on the request host", async () => {
      // The SSR half of the two-line module-options floor: the same option, the
      // same key as the client plugin resolves, on a per-request host that has
      // no loader to fetch anything with.
      createComviCore.mockImplementation((options: Record<string, unknown>) =>
        createI18n(options as unknown as Parameters<typeof createI18n>[0]),
      );

      const host = await getRequestI18n(
        createEvent({ defaultNs: "default", translation: { en: { greeting: "Hello" } } }),
        "en",
      );

      expect(createComviCore).toHaveBeenCalledWith(
        expect.objectContaining({ translation: { en: { greeting: "Hello" } } }),
      );
      expect(host.t("greeting")).toBe("Hello");
    });

    it("treats an empty-string translation from runtime config as no catalog", async () => {
      // Same normalization as the app plugin: the `""` runtime config makes of
      // an unset option must not reach core, which rejects a string catalog.
      createComviCore.mockImplementation((options: Record<string, unknown>) =>
        createI18n(options as unknown as Parameters<typeof createI18n>[0]),
      );

      await expect(getRequestI18n(createEvent({ translation: "" }), "en")).resolves.toBeDefined();

      expect(createComviCore).toHaveBeenCalledWith(
        expect.objectContaining({ translation: undefined }),
      );
    });

    it("passes an empty translation object through unchanged", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent({ translation: {} }), "en");

      expect(createComviCore).toHaveBeenCalledWith(expect.objectContaining({ translation: {} }));
    });

    it("prefers the configured fallbackLocale over defaultLocale and the request locale", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent({ fallbackLocale: "de", defaultLocale: "en" }), "uk");

      expect(createComviCore).toHaveBeenCalledWith(
        expect.objectContaining({ fallbackLocale: "de" }),
      );
    });

    it("falls back to defaultLocale when no fallbackLocale is configured", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent({ fallbackLocale: undefined, defaultLocale: "de" }), "uk");

      expect(createComviCore).toHaveBeenCalledWith(
        expect.objectContaining({ fallbackLocale: "de" }),
      );
    });

    it("falls back to the request locale when neither fallback nor default locale is configured", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(
        createEvent({ fallbackLocale: undefined, defaultLocale: undefined }),
        "uk",
      );

      expect(createComviCore).toHaveBeenCalledWith(
        expect.objectContaining({ fallbackLocale: "uk" }),
      );
    });

    it("defaults the namespace to `default` when none is configured", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent({ defaultNs: undefined }), "en");

      expect(createComviCore).toHaveBeenCalledWith(
        expect.objectContaining({ defaultNs: "default" }),
      );
    });

    it("turns on host dev mode when NODE_ENV is development", async () => {
      vi.stubEnv("NODE_ENV", "development");
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent(), "en");

      expect(createComviCore).toHaveBeenCalledWith(expect.objectContaining({ devMode: true }));
    });

    it("passes no api key when the private runtime config is absent", async () => {
      createComviCore.mockReturnValue(createHost());
      const event = eventFor({
        runtimeConfig: { public: { comvi: { defaultLocale: "en" } } },
      });

      await getRequestI18n(event, "en");

      expect(createComviCore).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }));
    });

    it("forwards defaultParams to the host when configured", async () => {
      createComviCore.mockReturnValue(createHost());

      await getRequestI18n(createEvent({ defaultParams: { formality: "formal" } }), "en");

      expect(createComviCore).toHaveBeenCalledWith(
        expect.objectContaining({ defaultParams: { formality: "formal" } }),
      );
    });
  });

  describe("locale correction", () => {
    it("corrects a host that ignored the requested locale before initializing it", async () => {
      const host = createHost("en");
      let localeAtInit: string | undefined;
      host.init.mockImplementation(async () => {
        localeAtInit = host.locale;
      });
      createComviCore.mockReturnValue(host);

      await getRequestI18n(createEvent(), "de");

      expect(localeAtInit).toBe("de");
      expect(runComviSetup.mock.invocationCallOrder[0]).toBeLessThan(
        host.init.mock.invocationCallOrder[0],
      );
    });

    it("hands the comvi.setup hook the request host as `core`", async () => {
      const host = createHost("en");
      createComviCore.mockReturnValue(host);

      await getRequestI18n(createEvent(), "en");

      expect(runComviSetup).toHaveBeenCalledWith(expect.objectContaining({ core: host }));
    });

    it("leaves a host that already reports the requested locale untouched", async () => {
      const { host, writes } = createHostWithLocaleWrites("de");
      createComviCore.mockReturnValue(host);

      await getRequestI18n(createEvent(), "de");

      expect(writes).toEqual([]);
    });

    it("re-syncs a cached host whose locale drifted since it was created", async () => {
      const shared = createHost("en");
      createComviCore.mockReturnValue(shared);
      const event = createEvent();

      await getRequestI18n(event, "en");
      await getRequestI18n(event, "de");
      const back = await getRequestI18n(event, "en");

      expect(back.locale).toBe("en");
      expect(shared.setLocale).toHaveBeenCalledWith("en");
    });
  });

  describe("failed initialization", () => {
    it("keeps the other locales' hosts when one locale fails to initialize", async () => {
      const english = createHost("en");
      const broken = createHost("de");
      broken.init.mockRejectedValue(new Error("catalog unreachable"));
      createComviCore.mockImplementation((options: { locale: string }) =>
        options.locale === "de" ? broken : english,
      );
      const event = createEvent();

      await getRequestI18n(event, "en");
      await expect(getRequestI18n(event, "de")).rejects.toThrow("catalog unreachable");
      const again = await getRequestI18n(event, "en");

      expect(again).toBe(english);
      expect(createComviCore).toHaveBeenCalledTimes(2);
    });
  });
});
