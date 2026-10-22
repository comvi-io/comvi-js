import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiClient } from "../src/core/ApiClient";
import { ErrorCodes, exitCodeFor, TypegenError } from "../src/utils/errors";
import { assertNoUnexpectedRequests, rejectionOf, stubFetch, type RouteResponse } from "./helpers";

const contract = JSON.parse(
  readFileSync(join(__dirname, "fixtures/translate/contract.json"), "utf-8"),
) as {
  fill: Record<string, RouteResponse>;
  status: Record<string, RouteResponse>;
};

const API = "https://api.test.com";
const PROJECT = "/v1/project";
const FILL = "/v1/projects/123/mt/fill";
const STATUS = "/v1/projects/123/keys/batch/mt/fill-123-de-3f1c/status";

function client(): ApiClient {
  return new ApiClient({ apiKey: "k", apiBaseUrl: API });
}

async function typegenRejection(promise: Promise<unknown>): Promise<TypegenError> {
  const error = await rejectionOf(promise);
  expect(error).toBeInstanceOf(TypegenError);
  return error as TypegenError;
}

describe("ApiClient.fillMissing", () => {
  afterEach(() => {
    vi.useRealTimers();
    assertNoUnexpectedRequests();
  });

  it("posts the body to mt/fill and returns the parsed response", async () => {
    const http = stubFetch({
      [PROJECT]: { body: { id: 123, sourceLocale: "en" } },
      [FILL]: contract.fill.enqueued,
    });

    const response = await client().fillMissing({
      targetLocaleCodes: ["de"],
      namespaces: ["common"],
      maxPairs: 1000,
    });

    expect(http.jsonBodyFor(FILL)).toEqual({
      targetLocaleCodes: ["de"],
      namespaces: ["common"],
      maxPairs: 1000,
    });
    expect(http.requests.find((r) => r.url.endsWith(FILL))?.init.method).toBe("POST");
    expect(response.jobs).toHaveLength(2);
    expect(response.pairs.toTranslate).toBe(2);
    expect(response.skippedLocales).toEqual([{ code: "ja", reason: "forbidden" }]);
  });

  it("does not retry an enqueue that answered 503", async () => {
    const http = stubFetch({
      [PROJECT]: { body: { id: 123 } },
      [FILL]: { status: 503, body: { code: "SERVICE_UNAVAILABLE" } },
    });

    const error = await typegenRejection(client().fillMissing({}));

    expect(exitCodeFor(error)).toBe(2);
    expect(http.paths().filter((p) => p === FILL)).toHaveLength(1);
  });

  it("retries a dry run that answered 503, like any read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const http = stubFetch({
      [PROJECT]: { body: { id: 123 } },
      [FILL]: [{ status: 503, body: {} }, contract.fill.dryRun],
    });

    const pending = client().fillMissing({ dryRun: true });
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;

    expect(response.pairs.toTranslate).toBe(2);
    expect(http.paths().filter((p) => p === FILL)).toHaveLength(2);
  });

  it("never retries a 4xx", async () => {
    const http = stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.overLimit });

    await typegenRejection(client().fillMissing({ dryRun: true }));

    expect(http.paths().filter((p) => p === FILL)).toHaveLength(1);
  });

  it("tells a missing route (exit 4) apart from a missing project (exit 3)", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.routeNotFound });
    const route = await typegenRejection(client().fillMissing({ dryRun: true }));
    expect(route.code).toBe(ErrorCodes.API_UNSUPPORTED);
    expect(route.message).toContain("does not support comvi translate");
    expect(exitCodeFor(route)).toBe(4);

    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.projectNotFound });
    const project = await typegenRejection(client().fillMissing({ dryRun: true }));
    expect(project.code).not.toBe(ErrorCodes.API_UNSUPPORTED);
    expect(project.details?.code).toBe("PROJECT_NOT_FOUND");
    expect(exitCodeFor(project)).toBe(3);
  });

  it("names the mt:use scope on a 403 for a missing scope and keeps the meta", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.missingScope });

    const error = await typegenRejection(client().fillMissing({ dryRun: true }));

    expect(exitCodeFor(error)).toBe(3);
    expect(error.message).toContain("mt:use");
    expect((error.details?.meta as Record<string, unknown>).requiredScope).toBe("mt:use");
  });

  it("does not blame the scope for a forbidden locale", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.forbiddenLocale });

    const error = await typegenRejection(client().fillMissing({ targetLocaleCodes: ["ja"] }));

    expect(exitCodeFor(error)).toBe(3);
    expect(error.message).toContain("locale ja");
    expect(error.message).not.toContain("mt:use");
  });

  it("keeps LIMIT_EXCEEDED with the in-flight jobs in its meta", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.creditsExhausted });

    const error = await typegenRejection(client().fillMissing({}));

    expect(error.details?.code).toBe("LIMIT_EXCEEDED");
    expect(exitCodeFor(error)).toBe(3);
    expect(error.message).not.toContain("mt:use");
    expect((error.details?.meta as { jobs: unknown[] }).jobs).toHaveLength(1);
  });

  it("keeps MT_FILL_LIMIT with the pairs and the estimate", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.overLimit });

    const error = await typegenRejection(client().fillMissing({ maxPairs: 1000 }));

    expect(error.details?.code).toBe("MT_FILL_LIMIT");
    expect(exitCodeFor(error)).toBe(4);
    expect(error.details?.meta).toMatchObject({ pairs: { toTranslate: 2400 } });
  });

  it("refuses a response that is not the fill shape", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: { status: 202, body: { jobs: "x" } } });

    const error = await typegenRejection(client().fillMissing({}));

    expect(error.code).toBe(ErrorCodes.API_INVALID_RESPONSE);
  });
});

describe("ApiClient.getMtJobStatus", () => {
  afterEach(assertNoUnexpectedRequests);

  it("returns the job's status with typed errors", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: contract.status.completedWithErrors });

    const status = await client().getMtJobStatus("fill-123-de-3f1c");

    expect(status?.status).toBe("completed");
    expect(status?.result?.errors?.[0].type).toBe("insufficient_credits");
  });

  it("returns null for a job the platform no longer has", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: contract.status.gone });

    expect(await client().getMtJobStatus("fill-123-de-3f1c")).toBeNull();
  });

  it("encodes the job id into the path", async () => {
    const http = stubFetch({
      [PROJECT]: { body: { id: 123 } },
      "/v1/projects/123/keys/batch/mt/a%2Fb/status": { body: { jobId: "a/b", status: "waiting" } },
    });

    await client().getMtJobStatus("a/b");

    expect(http.paths()).toContain("/v1/projects/123/keys/batch/mt/a%2Fb/status");
  });

  it("throws on a 403 for a job in a locale the key may not use", async () => {
    stubFetch({
      [PROJECT]: { body: { id: 123 } },
      [STATUS]: { status: 403, body: { code: "FORBIDDEN", message: "No access to locale ja" } },
    });

    const error = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));

    expect(exitCodeFor(error)).toBe(3);
  });
});

describe("ApiClient.pushTranslations scheduleAutoMt", () => {
  afterEach(assertNoUnexpectedRequests);

  const COMMIT = "/v1/projects/123/import/commit";
  const ok = {
    body: {
      success: true,
      stats: { keysCreated: 0, translationsCreated: 0, translationsUpdated: 0 },
    },
  };

  it("sends scheduleAutoMt in the commit options when it is given", async () => {
    const http = stubFetch({ [PROJECT]: { body: { id: 123 } }, [COMMIT]: ok });

    await client().pushTranslations({
      translations: { en: { common: { a: "A" } } },
      forceMode: "override",
      scheduleAutoMt: false,
    });

    expect((http.jsonBodyFor(COMMIT).options as Record<string, unknown>).scheduleAutoMt).toBe(
      false,
    );
  });

  it("leaves the commit options as they were when it is not given", async () => {
    const http = stubFetch({ [PROJECT]: { body: { id: 123 } }, [COMMIT]: ok });

    await client().pushTranslations({
      translations: { en: { common: { a: "A" } } },
      forceMode: "override",
    });

    expect(http.jsonBodyFor(COMMIT).options).toEqual({
      conflictResolution: "keep_local",
      createNamespaces: true,
      deleteOrphans: false,
    });
  });
});

describe("ApiClient MT requests, failure by failure", () => {
  afterEach(() => {
    vi.useRealTimers();
    assertNoUnexpectedRequests();
  });

  /** A platform that answers the project lookup and never answers anything else. */
  function stallAfterProject(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init: RequestInit = {}) => {
        if (new URL(String(input)).pathname === PROJECT) {
          return { ok: true, status: 200, json: async () => ({ id: 123 }) } as Response;
        }
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        });
      }),
    );
  }

  it.each([
    ["fillMissing", (api: ApiClient) => api.fillMissing({})],
    ["getMtJobStatus", (api: ApiClient) => api.getMtJobStatus("fill-123-de-3f1c")],
  ])("%s reports a timeout as exit 2", async (_name, call) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stallAfterProject();
    const api = new ApiClient({ apiKey: "k", apiBaseUrl: API, timeout: 50 });

    const pending = typegenRejection(call(api));
    await vi.advanceTimersByTimeAsync(50);
    const error = await pending;

    expect(error.code).toBe(ErrorCodes.API_TIMEOUT);
    expect(error.message).toBe("Request timeout after 50ms");
  });

  it("names the request in a network failure", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: { networkError: "ECONNRESET" } });
    const fill = await typegenRejection(client().fillMissing({}));
    expect(fill.message).toBe("Failed to request machine translation: fetch failed (ECONNRESET)");
    expect(exitCodeFor(fill)).toBe(2);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: { networkError: "ECONNRESET" } });
    const status = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));
    expect(status.message).toBe(
      "Failed to read machine translation job fill-123-de-3f1c: fetch failed (ECONNRESET)",
    );
  });

  it("names the request in a 5xx", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: { status: 503, body: {} } });
    const fill = await typegenRejection(client().fillMissing({}));
    expect(fill.message).toBe("Failed to request machine translation: 503 OK");

    stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: { status: 500, body: {} } });
    const status = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));
    expect(status.message).toBe("Failed to read machine translation job fill-123-de-3f1c: 500 OK");
  });

  it("does not retry a status request: the poller has its own budget", async () => {
    const http = stubFetch({
      [PROJECT]: { body: { id: 123 } },
      [STATUS]: { status: 503, body: {} },
    });

    await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));

    expect(http.paths().filter((path) => path === STATUS)).toHaveLength(1);
  });

  it("says which response is not in shape", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: { status: 202, body: {} } });
    expect((await typegenRejection(client().fillMissing({}))).message).toBe(
      "The platform's mt/fill response is not in the expected shape",
    );

    stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: { body: { status: "paused" } } });
    const status = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));
    expect(status.message).toBe(
      "The platform's MT job status response is not in the expected shape",
    );
    expect(exitCodeFor(status)).toBe(2);
  });

  it("asks for a status with a GET and the key", async () => {
    const http = stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: contract.status.waiting });

    await client().getMtJobStatus("fill-123-de-3f1c");

    const init = http.requests.find((r) => new URL(r.url).pathname === STATUS)!.init;
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("names the job in a 403 on its status", async () => {
    stubFetch({
      [PROJECT]: { body: { id: 123 } },
      [STATUS]: { status: 403, body: { code: "FORBIDDEN", message: "No access to locale ja" } },
    });

    const error = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));

    expect(error.message).toBe(
      "Access denied to machine translation job fill-123-de-3f1c: No access to locale ja (FORBIDDEN).",
    );
  });

  it("a rejected key on a status: exit 3", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: { status: 401, body: {} } });

    const error = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));

    expect(error.message).toBe("Invalid API key");
    expect(exitCodeFor(error)).toBe(3);
  });

  it("throws a status 404 that is about the project", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: contract.fill.projectNotFound });

    const error = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));

    expect(exitCodeFor(error)).toBe(3);
  });

  it("spells out the unsupported platform and the scope hint", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.routeNotFound });
    expect((await typegenRejection(client().fillMissing({}))).message).toBe(
      "The platform does not support comvi translate: POST mt/fill answered 404. " +
        "Update the platform, or check apiBaseUrl.",
    );

    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: contract.fill.missingScope });
    expect((await typegenRejection(client().fillMissing({}))).message).toBe(
      "Failed to request machine translation: 403 OK (FORBIDDEN): API key does not have required " +
        "permission: machine_translation.use. comvi translate needs an API key with the mt:use scope " +
        '("Machine translation (uses credits)"). A key\'s scopes cannot be changed: create a new key with it.',
    );
  });

  it("a rejected key on the fill: exit 3", async () => {
    stubFetch({ [PROJECT]: { body: { id: 123 } }, [FILL]: { status: 401, body: {} } });

    const error = await typegenRejection(client().fillMissing({}));

    expect(error.message).toBe("Invalid API key");
    expect(exitCodeFor(error)).toBe(3);
  });
});

describe("ApiClient.getMtJobStatus, review round", () => {
  afterEach(() => {
    vi.useRealTimers();
    assertNoUnexpectedRequests();
  });

  it("refuses the status of another job", async () => {
    stubFetch({
      [PROJECT]: { body: { id: 123 } },
      [STATUS]: { body: { jobId: "fill-123-de-other", status: "waiting" } },
    });

    const error = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));

    expect(error.code).toBe(ErrorCodes.API_INVALID_RESPONSE);
  });

  it("keeps a 429's Retry-After for the poller", async () => {
    stubFetch({
      [PROJECT]: { body: { id: 123 } },
      [STATUS]: { status: 429, body: {}, headers: { "retry-after": "4" } },
    });

    const error = await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"));

    expect(error.details?.retryAfterMs).toBe(4_000);
    expect(exitCodeFor(error)).toBe(2);
  });

  it("keeps no Retry-After on a 503 or a 429 without one", async () => {
    stubFetch({
      [PROJECT]: { body: { id: 123 } },
      [STATUS]: { status: 503, body: {}, headers: { "retry-after": "4" } },
    });
    expect(
      (await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"))).details,
    ).not.toHaveProperty("retryAfterMs");

    stubFetch({ [PROJECT]: { body: { id: 123 } }, [STATUS]: { status: 429, body: {} } });
    expect(
      (await typegenRejection(client().getMtJobStatus("fill-123-de-3f1c"))).details,
    ).not.toHaveProperty("retryAfterMs");
  });

  it("cuts a request at the budget it is given, never past the client's timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init: RequestInit = {}) => {
        if (new URL(String(input)).pathname === PROJECT) {
          return { ok: true, status: 200, json: async () => ({ id: 123 }) } as Response;
        }
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        });
      }),
    );
    const api = new ApiClient({ apiKey: "k", apiBaseUrl: API, timeout: 500 });

    const short = typegenRejection(api.getMtJobStatus("fill-123-de-3f1c", { timeoutMs: 120 }));
    await vi.advanceTimersByTimeAsync(120);
    expect((await short).message).toBe("Request timeout after 120ms");

    const long = typegenRejection(api.getMtJobStatus("fill-123-de-3f1c", { timeoutMs: 9_000 }));
    await vi.advanceTimersByTimeAsync(500);
    expect((await long).message).toBe("Request timeout after 500ms");
  });
});
