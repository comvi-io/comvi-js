/**
 * Transport-mode contract: every editor service goes through the injected
 * ApiTransport with path-relative requests, and NOTHING resembling a
 * credential is ever constructed in the page world — no headers at all leave
 * the runtime in transport mode. This is the boundary the Chrome extension
 * relies on; if a service starts calling fetch directly or adds a new
 * endpoint, these tests must be updated together with the extension's route
 * contract (chrome-extension/src/shared/proxy.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initApiConfig,
  resetApiConfig,
  isDemoMode,
  type ApiTransportInit,
} from "../src/config/api";
import { apiFetch } from "../src/services/apiClient";
import { getLanguages } from "../src/services/languageService";
import {
  getTranslation,
  saveTranslation,
  deleteTranslation,
  getAllTranslationKeys,
} from "../src/services/translationService";
import { CollectorTransport } from "../src/collector/transport";

const SCOPE = "transport-contract-test";
const BASE = "https://api.comvi.io";

interface RecordedCall {
  path: string;
  init?: ApiTransportInit;
}

let calls: RecordedCall[];
let responder: (path: string) => Response;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const transport = vi.fn(async (path: string, init?: ApiTransportInit) => {
  calls.push({ path, init });
  return responder(path);
});

beforeEach(() => {
  calls = [];
  responder = () => jsonResponse({});
  transport.mockClear();
  initApiConfig(undefined, SCOPE, { transport, baseUrl: BASE });
});

afterEach(() => {
  resetApiConfig(SCOPE);
});

function allSerializedCalls(): string {
  return JSON.stringify(calls);
}

describe("transport mode basics", () => {
  it("is not demo mode even without an apiKey", () => {
    expect(isDemoMode(SCOPE)).toBe(false);
  });

  it("apiFetch delegates to the transport without any headers", async () => {
    await apiFetch(SCOPE, "/v1/project", {
      method: "GET",
      headers: { Authorization: "Bearer should-not-leak", "X-Custom": "x" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/v1/project");
    expect(calls[0].init).not.toHaveProperty("headers");
    expect(allSerializedCalls()).not.toContain("Authorization");
    expect(allSerializedCalls()).not.toContain("Bearer");
  });

  it("forwards abort signals to the transport", async () => {
    const controller = new AbortController();
    await apiFetch(SCOPE, "/v1/project", { signal: controller.signal });
    expect(calls[0].init?.signal).toBe(controller.signal);
  });
});

describe("editor services over the transport", () => {
  it("languageService: GET /v1/project/locales", async () => {
    responder = () => jsonResponse({ sourceLocale: "en", locales: [{ code: "en" }] });
    await getLanguages(SCOPE);
    expect(calls).toEqual([expect.objectContaining({ path: "/v1/project/locales" })]);
    expect(calls[0].init?.method).toBe("GET");
  });

  it("getTranslation: GET /v1/keys/:ns/:key with encoded params", async () => {
    responder = () => new Response("", { status: 404 });
    await getTranslation("hero.title", "common ns", SCOPE);
    expect(calls[0].path).toBe("/v1/keys/common%20ns/hero.title");
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.body).toBeUndefined();
  });

  it("saveTranslation: PUT /v1/keys with the documented body shape", async () => {
    responder = () =>
      jsonResponse({
        id: 1,
        key: "hero.title",
        namespaceId: 1,
        isPlural: false,
        namespace: "common",
        createdAt: "",
        updatedAt: "",
        translations: {},
      });
    await saveTranslation(
      "hero.title",
      "common",
      { en: { other: "Hello" } },
      false,
      undefined,
      undefined,
      SCOPE,
    );
    expect(calls[0].path).toBe("/v1/keys");
    expect(calls[0].init?.method).toBe("PUT");
    const body = JSON.parse(calls[0].init?.body ?? "{}");
    expect(Object.keys(body).sort()).toEqual(["isPlural", "key", "namespace", "translations"]);
    expect(body.translations.en).toEqual({ value: "Hello", status: "not_reviewed" });
  });

  it("deleteTranslation: DELETE /v1/keys/:ns/:key", async () => {
    responder = () => new Response("{}", { status: 200 });
    await deleteTranslation("hero.title", "common", SCOPE);
    expect(calls[0].path).toBe("/v1/keys/common/hero.title");
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("getAllTranslationKeys: GET /v1/translations", async () => {
    responder = () => jsonResponse({ namespaces: {} });
    await getAllTranslationKeys(SCOPE);
    expect(calls[0].path).toBe("/v1/translations");
    expect(calls[0].init?.method).toBe("GET");
  });

  it("collector handshake: POST /v1/context/handshake", async () => {
    responder = () => jsonResponse({ entries: [] });
    const collector = new CollectorTransport(SCOPE);
    const ok = await collector.handshake([{ namespace: "common", key: "hero.title" }]);
    expect(ok).toBe(true);
    expect(calls[0].path).toBe("/v1/context/handshake");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body ?? "{}")).toEqual({
      keys: [{ namespace: "common", key: "hero.title" }],
    });
  });

  it("never constructs an Authorization header anywhere in transport mode", async () => {
    responder = () => jsonResponse({ sourceLocale: "en", locales: [], namespaces: {} });
    await getLanguages(SCOPE);
    await getAllTranslationKeys(SCOPE);
    responder = () => new Response("", { status: 404 });
    await getTranslation("k", "ns", SCOPE);
    const serialized = allSerializedCalls();
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("apiKey");
  });
});
