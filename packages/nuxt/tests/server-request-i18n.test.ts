import { beforeEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { getRequestI18n } from "../src/runtime/server/utils/request-i18n";
import { createComviCore, resetComviHostMock } from "./mocks/comvi-host";
import { resetComviSetupMock, runComviSetup } from "./mocks/comvi-setup";

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

const eventFor = (context: unknown) => ({ context }) as unknown as H3Event;

const createEvent = (comvi: ComviPublic = {}, privateComvi: unknown = {}) =>
  eventFor(createContext(comvi, privateComvi));

function createHost(locale = "en") {
  const host = {
    locale,
    init: vi.fn().mockResolvedValue(undefined),
    setLocaleAsync: vi.fn(async (next: string) => {
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
      });
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
      expect(shared.setLocaleAsync).toHaveBeenCalledWith("en");
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
