import { afterEach, beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import { ErrorCodes } from "../src/utils/errors";
import type { ProjectInfo } from "../src/types";

const projectInfo = { id: 123, name: "Test Project" } as ProjectInfo;

const json = (status: number, body: unknown, statusText = "") =>
  new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });

describe("push result: what the commit actually did", () => {
  let fetchMock: MockedFunction<typeof fetch>;
  let client: ApiClient;

  beforeEach(() => {
    fetchMock = vi.fn() as MockedFunction<typeof fetch>;
    vi.stubGlobal("fetch", fetchMock);
    client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test.com" });
  });

  afterEach(() => vi.unstubAllGlobals());

  const push = () =>
    client.pushTranslations({
      translations: { en: { common: { a: "A", b: "B" } }, fr: { common: { a: "A fr" } } },
      forceMode: "override",
    });

  it("maps created, changed, kept and skipped-locale counts", async () => {
    fetchMock.mockResolvedValueOnce(json(200, projectInfo)).mockResolvedValueOnce(
      json(200, {
        success: true,
        stats: {
          keysCreated: 1,
          keysUpdated: 1,
          keysDeleted: 0,
          translationsCreated: 1,
          translationsUpdated: 1,
          translationsSkipped: 0,
          namespacesCreated: [],
          skippedLocales: ["fr"],
        },
      }),
    );

    await expect(push()).resolves.toEqual({
      created: 1,
      valuesCreated: 1,
      updated: 1,
      skipped: 0,
      skippedLocales: ["fr"],
      detailed: true,
    });
  });

  // An older platform reports skipped conflicts as "translationsUpdated" and
  // counts updates as created: neither number can be shown as such.
  it("does not present an older platform's counts as value counts", async () => {
    fetchMock.mockResolvedValueOnce(json(200, projectInfo)).mockResolvedValueOnce(
      json(200, {
        success: true,
        stats: {
          keysCreated: 2,
          keysUpdated: 0,
          keysDeleted: 0,
          translationsCreated: 3,
          translationsUpdated: 0,
          namespacesCreated: [],
        },
      }),
    );

    await expect(push()).resolves.toMatchObject({ created: 2, detailed: false });
  });
});

describe("platform error messages survive", () => {
  let fetchMock: MockedFunction<typeof fetch>;
  let client: ApiClient;

  beforeEach(() => {
    fetchMock = vi.fn() as MockedFunction<typeof fetch>;
    vi.stubGlobal("fetch", fetchMock);
    client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test.com" });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps the platform's 403 message and names the scope typegen needs", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, projectInfo))
      .mockResolvedValueOnce(
        json(403, { message: "Insufficient permissions", code: "INSUFFICIENT_PERMISSIONS" }),
      );

    const error = await client.fetchSchema().catch((e: unknown) => e);

    expect(error).toMatchObject({ code: ErrorCodes.API_AUTH_FAILED });
    expect((error as Error).message).toBe(
      "Access denied to this project: Insufficient permissions (INSUFFICIENT_PERMISSIONS). " +
        "comvi typegen needs an API key with the schema:read scope.",
    );
  });

  it("names the scope push needs", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, projectInfo))
      .mockResolvedValueOnce(json(403, { message: "Organization is in read-only mode." }));

    const error = await client
      .pushTranslations({ translations: { en: { common: { a: "A" } } }, forceMode: "override" })
      .catch((e: unknown) => e);

    expect((error as Error).message).toBe(
      "Access denied to this project: Organization is in read-only mode. " +
        "comvi push needs an API key with the translations:write scope.",
    );
  });

  it("names the scope pull needs", async () => {
    fetchMock.mockResolvedValueOnce(json(403, { message: "Insufficient permissions" }));

    const error = await client.fetchTranslations().catch((e: unknown) => e);

    expect((error as Error).message).toBe(
      "Access denied to this project: Insufficient permissions. " +
        "comvi pull needs an API key with the translations:read scope.",
    );
  });

  it("reports a 422 that carries a code and a field but no message", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, projectInfo))
      .mockResolvedValueOnce(
        json(
          422,
          { code: "FIELD_REQUIRED", meta: { field: "namespaces" } },
          "Unprocessable Entity",
        ),
      );

    const error = await client
      .pushTranslations({ translations: { en: { common: { a: "A" } } }, forceMode: "override" })
      .catch((e: unknown) => e);

    expect((error as Error).message).toBe(
      "Failed to push translations: 422 Unprocessable Entity (FIELD_REQUIRED: namespaces)",
    );
  });
});
