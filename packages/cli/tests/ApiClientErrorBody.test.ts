import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from "vitest";
import { ApiClient } from "../src/core/ApiClient";
import { ErrorCodes, TypegenError } from "../src/utils/errors";
import type { ProjectInfo } from "../src/types";

const projectInfo = { id: 123, organizationId: 1, name: "P", sourceLocale: "en" } as ProjectInfo;

function failure(status: number, statusText: string, body: string): Response {
  return new Response(body === "" ? null : body, { status, statusText });
}

const push = (client: ApiClient) =>
  client.pushTranslations({ translations: { en: { default: { a: "A" } } }, forceMode: "override" });

async function rejectionOf(promise: Promise<unknown>): Promise<TypegenError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TypegenError);
    return error as TypegenError;
  }
  throw new Error("expected the call to reject");
}

describe("ApiClient surfaces the platform's error body", () => {
  let fetchMock: MockedFunction<typeof fetch>;
  let client: ApiClient;

  beforeEach(() => {
    fetchMock = vi.fn() as MockedFunction<typeof fetch>;
    vi.stubGlobal("fetch", fetchMock);
    client = new ApiClient({ apiKey: "k", apiBaseUrl: "https://api.test.com", timeout: 1000 });
    fetchMock.mockResolvedValueOnce(Response.json(projectInfo));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports the message and code of a 409 import conflict, keeping meta as details", async () => {
    fetchMock.mockResolvedValueOnce(
      failure(
        409,
        "Conflict",
        JSON.stringify({
          code: "IMPORT_CONFLICTS",
          message: "Resolve 2 conflicting keys",
          meta: { count: 2 },
        }),
      ),
    );

    const error = await rejectionOf(push(client));

    expect(error.message).toBe(
      "Failed to push translations: 409 Conflict (IMPORT_CONFLICTS): Resolve 2 conflicting keys",
    );
    expect(error.code).toBe(ErrorCodes.API_FETCH_FAILED);
    expect(error.details).toEqual({
      status: 409,
      code: "IMPORT_CONFLICTS",
      message: "Resolve 2 conflicting keys",
      meta: { count: 2 },
    });
  });

  it("reports the message of a 5xx JSON body", async () => {
    fetchMock.mockResolvedValueOnce(
      failure(503, "Service Unavailable", JSON.stringify({ message: "Import queue is full" })),
    );

    const error = await rejectionOf(push(client));

    expect(error.message).toBe(
      "Failed to push translations: 503 Service Unavailable: Import queue is full",
    );
  });

  it("falls back to the status line for a malformed JSON body", async () => {
    fetchMock.mockResolvedValueOnce(failure(500, "Internal Server Error", "{not json"));

    const error = await rejectionOf(push(client));

    expect(error.message).toBe("Failed to push translations: 500 Internal Server Error");
    expect(error.details).toEqual({ status: 500 });
  });

  it("falls back to the status line for an empty body", async () => {
    fetchMock.mockResolvedValueOnce(failure(502, "Bad Gateway", ""));

    const error = await rejectionOf(push(client));

    expect(error.message).toBe("Failed to push translations: 502 Bad Gateway");
  });

  it("reads the body of a GET failure that is not retried", async () => {
    // fetchTranslations needs no project lookup
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      failure(422, "Unprocessable Entity", JSON.stringify({ message: "Unknown locale xx" })),
    );

    const error = await rejectionOf(client.fetchTranslations({ locales: ["xx"] }));

    expect(error.message).toBe(
      "Failed to fetch translations: 422 Unprocessable Entity: Unknown locale xx",
    );
  });

  it("keeps a multi-line message to one line and bounds its length", async () => {
    fetchMock.mockResolvedValueOnce(
      failure(
        400,
        "Bad Request",
        JSON.stringify({ message: `line one\nline two ${"x".repeat(900)}` }),
      ),
    );

    const error = await rejectionOf(push(client));

    expect(error.message).not.toContain("\n");
    expect(
      error.message.startsWith("Failed to push translations: 400 Bad Request: line one line two"),
    ).toBe(true);
    expect(error.message.length).toBeLessThanOrEqual(600);
  });
});
