/**
 * `fetchApiTranslations` walks a four-step chain when the runtime endpoint has
 * no answer: /v1/translations → /v1/project → /v1/projects/{id}/export →
 * /api/v1/api/projects/{id}/export. These pin which step is taken when, and
 * what each request carries.
 */
import { describe, it, expect } from "vitest";
import { fetchApiTranslations } from "../src/index";
import { jsonResponse, recordingTransport } from "./helpers/transport";

const BASE = "https://api.example.com";
const PROJECT_ID = 42;
const NAMESPACES = ["default", "dashboard"];

const EXPORT_URL = `${BASE}/v1/projects/${PROJECT_ID}/export?locales=en&namespaces=default%2Cdashboard`;
const LEGACY_EXPORT_URL = `${BASE}/api/v1/api/projects/${PROJECT_ID}/export?locales=en&namespaces=default%2Cdashboard`;

const TRANSLATIONS = { namespaces: { default: { en: { hello: "Hi" } } } };

/** Answers the first three steps; `exportResponse` decides the fourth. */
function chainUpToExport(exportResponse: (url: string) => Response) {
  return recordingTransport((url) => {
    if (url.includes("/v1/translations")) return new Response(null, { status: 404 });
    if (url.endsWith("/v1/project")) return jsonResponse({ id: PROJECT_ID });
    return exportResponse(url);
  });
}

describe("fetchApiTranslations() export fallback", () => {
  it("requests the legacy export URL when the modern export 404s", async () => {
    const { fetchFn, calls } = chainUpToExport((url) =>
      url === EXPORT_URL ? new Response(null, { status: 404 }) : jsonResponse(TRANSLATIONS),
    );

    await expect(
      fetchApiTranslations("key", "en", NAMESPACES, BASE, 5000, fetchFn),
    ).resolves.toEqual(new Map([["en:default", { hello: "Hi" }]]));

    expect(calls.at(-1)?.url).toBe(LEGACY_EXPORT_URL);
  });

  it("sends the auth headers and SSR cache options on the legacy export request", async () => {
    const { fetchFn, calls } = chainUpToExport((url) =>
      url === EXPORT_URL ? new Response(null, { status: 404 }) : jsonResponse(TRANSLATIONS),
    );

    await fetchApiTranslations("key", "en", NAMESPACES, BASE, 5000, fetchFn, undefined, {
      next: { revalidate: 60 },
    });

    expect(calls.at(-1)).toMatchObject({
      url: LEGACY_EXPORT_URL,
      init: {
        headers: { Accept: "application/json", Authorization: "Bearer key" },
        next: { revalidate: 60 },
      },
    });
  });

  it("does not try the legacy export URL when the modern export fails with a non-404", async () => {
    const { fetchFn, calls } = chainUpToExport(
      () => new Response(null, { status: 500, statusText: "Server Error" }),
    );

    await expect(
      fetchApiTranslations("key", "en", NAMESPACES, BASE, 5000, fetchFn),
    ).rejects.toThrow("API error: 500 Server Error");

    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/v1/translations?locales=en&namespaces=default%2Cdashboard`,
      `${BASE}/v1/project`,
      EXPORT_URL,
    ]);
  });

  it("reports the legacy export status when that request fails too", async () => {
    const { fetchFn } = chainUpToExport((url) =>
      url === EXPORT_URL
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 503, statusText: "Unavailable" }),
    );

    await expect(
      fetchApiTranslations("key", "en", NAMESPACES, BASE, 5000, fetchFn),
    ).rejects.toThrow("API error: 503 Unavailable");
  });

  it("reports the runtime endpoint's status without bootstrapping the project when it is not a 404", async () => {
    const { fetchFn, calls } = recordingTransport(
      () => new Response(null, { status: 500, statusText: "Server Error" }),
    );

    await expect(
      fetchApiTranslations("key", "en", NAMESPACES, BASE, 5000, fetchFn),
    ).rejects.toThrow("API error: 500 Server Error");

    expect(calls).toHaveLength(1);
  });
});
