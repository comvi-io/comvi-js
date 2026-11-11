// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, eventHandler, toNodeListener } from "h3";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createI18n, type Loader } from "@comvi/core";
import { setNitroRuntimeConfig } from "./mocks/nitro-imports";
import { setComviOptions } from "./mocks/comvi-options";
import { useTranslation } from "../src/runtime/server/utils/useTranslation";
import comviRequestEnd from "../src/runtime/server/plugins/comvi";
import { track } from "../src/runtime/utils/instances";

const CATALOGS: Record<string, Record<string, string>> = {
  "en:default": { hello: "Hello" },
  "uk:default": { hello: "Привіт" },
  "en:admin": { title: "Admin" },
  "uk:admin": { title: "Адмін" },
};
const loader: Loader = async (locale, ns) => {
  const catalog = CATALOGS[`${locale}:${ns}`];
  if (!catalog) throw new Error(`${locale}:${ns}`);
  return catalog;
};

const routing = {
  locales: ["en", "uk"],
  localeObjects: {},
  defaultLocale: "en",
  localePrefix: "as-needed" as const,
  localeCookie: { name: "i18n_locale", maxAge: 60, secure: true, sameSite: "lax" as const },
  localeDetection: { order: ["query", "cookie", "accept-language"] as const },
};

/** A real h3 app with the module's Nitro plugin on Nitro's two hooks, answering on a port. */
async function serve(handler: Parameters<typeof eventHandler>[0]) {
  const hooks: Record<string, Array<(...args: any[]) => void>> = {};
  comviRequestEnd({
    hooks: { hook: (name: string, fn: any) => void (hooks[name] ||= []).push(fn) },
  } as never);
  const app = createApp({
    onRequest: (event) => hooks.request!.forEach((fn) => fn(event)),
    onAfterResponse: (event) => hooks.afterResponse!.forEach((fn) => fn(event)),
    onError: (error, event) => hooks.error!.forEach((fn) => fn(error, { event })),
  });
  app.use(eventHandler(handler));
  const server = createServer(toNodeListener(app));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}

beforeEach(() => {
  setNitroRuntimeConfig({ public: { comvi: routing } });
  setComviOptions({ fallbackLocale: "en" }, () => ({ loader }));
});

describe("useTranslation(event)", () => {
  const event = (headers: Record<string, string> = {}, path = "/api/x") =>
    ({
      path,
      context: {},
      node: { req: { headers, url: path } },
      headers: new Headers(headers),
    }) as never;

  it("resolves the locale like the page (cookie, Accept-Language), loads the namespace and returns { t, locale, dir, i18n }", async () => {
    const r = await useTranslation(event({ "accept-language": "uk" }));
    expect(r.locale).toBe("uk");
    expect(r.dir).toBe("ltr");
    expect(r.t("hello")).toBe("Привіт");
    const admin = await useTranslation(event({ cookie: "i18n_locale=uk" }), { ns: "admin" });
    expect(admin.t("title")).toBe("Адмін");
  });

  it("one instance per (request, locale): a second call in the request gets the same one", async () => {
    const e = event();
    const a = await useTranslation(e);
    const b = await useTranslation(e, { ns: "admin" });
    const c = await useTranslation(e, { locale: "uk" });
    expect(b.i18n).toBe(a.i18n);
    expect(c.i18n).not.toBe(a.i18n);
    expect((await useTranslation(event())).i18n).not.toBe(a.i18n);
  });

  it("a locale prefix on the path wins; an explicit locale outside comvi.locales throws", async () => {
    expect((await useTranslation(event({}, "/uk/api/x"))).locale).toBe("uk");
    await expect(useTranslation(event(), { locale: "fr" })).rejects.toThrow(RangeError);
  });

  it("calls the options factory with the request's event", async () => {
    const factory = vi.fn(() => ({ loader }));
    setComviOptions({}, factory);
    const e = event();
    await useTranslation(e);
    expect(factory).toHaveBeenCalledWith(e);
  });
});

describe("the request-end plugin", () => {
  /** An instance of the request whose load never answers; counts its abort and its end. */
  const hanging = (
    e: Parameters<typeof track>[0],
    state: { aborted: number; destroyed: number },
  ) => {
    const i18n = track(
      e,
      createI18n({
        locale: "en",
        timeZone: "UTC",
        loader: (_l, _n, signal) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => {
              state.aborted++;
              reject(new Error("aborted"));
            }),
          ),
      }),
    );
    const destroy = i18n.destroy.bind(i18n);
    i18n.destroy = () => (state.destroyed++, destroy());
  };

  it("after the response: every instance of the request is destroyed, its load aborted", async () => {
    const state = { aborted: 0, destroyed: 0 };
    const { url, close } = await serve((e) => {
      hanging(e, state);
      hanging(e, state);
      return "ok";
    });
    expect(await (await fetch(url)).text()).toBe("ok");
    await expect.poll(() => state.destroyed).toBe(2);
    expect(state.aborted).toBe(2);
    await close();
  });

  it("when the client goes away while the handler still waits for a load: destroyed at the close", async () => {
    const state = { aborted: 0, destroyed: 0 };
    let started!: () => void;
    const handling = new Promise<void>((resolve) => (started = resolve));
    const { url, close } = await serve(async (e) => {
      hanging(e, state);
      started();
      await new Promise(() => {});
    });
    const gone = new AbortController();
    const pending = fetch(url, { signal: gone.signal }).catch(() => "aborted");
    // The handler holds its instance and waits for the load: the client goes away now.
    await handling;
    expect(state.destroyed).toBe(0);
    gone.abort();
    expect(await pending).toBe("aborted");
    await expect.poll(() => state.destroyed).toBe(1);
    expect(state.aborted).toBe(1);
    await close();
  });

  it("when the handler throws: destroyed through the error hook (h3 skips afterResponse)", async () => {
    const state = { aborted: 0, destroyed: 0 };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { url, close } = await serve((e) => {
      hanging(e, state);
      throw new Error("boom");
    });
    expect((await fetch(url)).status).toBe(500);
    await expect.poll(() => state.destroyed).toBe(1);
    expect(state.aborted).toBe(1);
    await close();
  });
});
