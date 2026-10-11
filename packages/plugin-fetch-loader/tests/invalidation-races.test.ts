/**
 * Dedup must respect the host's invalidations. Core drops its own pending load
 * on `reloadMessages()` / `clearMessages()`; the plugin's request map has to
 * follow, or the new core load joins the request core just abandoned.
 *
 * Ported from the 0.5 release review's dist-level reproduction
 * (`fetch-races.mjs`): each test replaces `fetch` outright, so MSW sees none
 * of these requests.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "@comvi/core";
import { cdnLoader } from "../src";
import { fetchLoader } from "../src/api";
import { deferred } from "./helpers/deferred";

const CDN = "https://fixture.invalid/catalog";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(["cdn", "api"] as const)("%s: reload while a load is pending", (mode) => {
  it("fetches fresh messages instead of joining the pre-reload request", async () => {
    const requested = deferred<void>();
    const oldAnswer = deferred<Response>();
    const response = (key: string) =>
      Response.json(mode === "api" ? { namespaces: { default: { en: { key } } } } : { key });
    const catalogCalls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/v1/project")) {
        return Response.json({ id: 1, organizationId: 1, name: "p", sourceLocale: "en" });
      }
      catalogCalls.push(url);
      if (catalogCalls.length === 1) {
        requested.resolve();
        return oldAnswer.promise;
      }
      return response("fresh");
    });
    const host = createI18n({
      locale: "en",
      ns: [],
      ...(mode === "api" ? { apiKey: "fixture-key" } : {}),
    }).use((mode === "api" ? fetchLoader : cdnLoader)({ cdnUrl: CDN }));

    try {
      await host.init();
      const first = host.addActiveNamespace("default");
      await requested.promise;

      const reloaded = host.reloadMessages("en", "default");
      oldAnswer.resolve(response("stale"));
      await Promise.all([first, reloaded]);

      expect(host.t("key")).toBe("fresh");
      expect(catalogCalls).toHaveLength(2);
    } finally {
      await host.destroy();
    }
  });
});

describe("cdn: clear followed immediately by a load", () => {
  it("starts a new request instead of joining the aborted one", async () => {
    const requested = deferred<void>();
    let calls = 0;
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      calls++;
      if (calls > 1) return Response.json({ key: "fresh" });
      requested.resolve();
      return new Promise((_resolve, reject) =>
        options.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        ),
      );
    });
    const host = createI18n({ locale: "en", ns: [] }).use(cdnLoader({ cdnUrl: CDN }));

    try {
      await host.init();
      const first = host.getLoader()!("en", "default").catch(() => undefined);
      await requested.promise;

      host.clearMessages("en", "default");
      const messages = await host.getLoader()!("en", "default");

      expect(messages).toEqual({ key: "fresh" });
      await first;
    } finally {
      await host.destroy();
    }
  });

  it("does not join an aborted request after a namespace-only clear of an empty cache", async () => {
    const requested = deferred<void>();
    let calls = 0;
    vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
      calls++;
      if (calls > 1) return Response.json({ key: "fresh" });
      requested.resolve();
      return new Promise((_resolve, reject) =>
        options.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        ),
      );
    });
    const host = createI18n({ locale: "en", ns: [] }).use(cdnLoader({ cdnUrl: CDN }));

    try {
      await host.init();
      const first = host.getLoader()!("en", "default").catch(() => undefined);
      await requested.promise;

      host.clearMessages(undefined, "default");
      await expect(host.getLoader()!("en", "default")).resolves.toEqual({ key: "fresh" });
      await first;
    } finally {
      await host.destroy();
    }
  });
});

describe("api: a reload of one namespace in a shared batch", () => {
  it("keeps the other namespace on the shared request and refetches only after the reload", async () => {
    const requested = deferred<void>();
    const oldAnswer = deferred<Response>();
    const catalogCalls: string[] = [];
    const batch = (tag: string) =>
      Response.json({
        namespaces: {
          admin: { en: { title: `admin ${tag}` } },
          shop: { en: { cart: `shop ${tag}` } },
        },
      });
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/v1/project")) {
        return Response.json({ id: 1, organizationId: 1, name: "p", sourceLocale: "en" });
      }
      catalogCalls.push(url);
      if (catalogCalls.length === 1) {
        requested.resolve();
        return oldAnswer.promise;
      }
      return batch("fresh");
    });
    const host = createI18n({ locale: "en", ns: [], apiKey: "fixture-key" }).use(
      fetchLoader({ cdnUrl: CDN }),
    );

    try {
      await host.init();
      const both = host.addActiveNamespaces(["admin", "shop"]);
      await requested.promise;
      // Two namespaces activated together share ONE batch request.
      expect(catalogCalls).toHaveLength(1);

      const reloaded = host.reloadMessages("en", "admin");
      oldAnswer.resolve(batch("stale"));
      await Promise.all([both, reloaded]);

      expect(host.t("title", { ns: "admin" })).toBe("admin fresh");
      expect(host.t("cart", { ns: "shop" })).toBe("shop stale");
      expect(catalogCalls).toHaveLength(2);
    } finally {
      await host.destroy();
    }
  });
});
