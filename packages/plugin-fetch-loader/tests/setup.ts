import { beforeAll, afterEach, afterAll, beforeEach, expect } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { HttpNetworkFrame } from "msw/experimental";
import type { ExportApiResponse } from "../src/types";
import type { ProjectInfo } from "../src/api";
import { clearProjectInfoCache } from "../src/api";
import { deferred } from "./helpers/deferred";

/**
 * The CORS preflight a browser sends before every cross-origin request here.
 * happy-dom's `fetch` sends one (the test page is `http://localhost:3000`),
 * and MSW 3 intercepts below `fetch`, at the socket, so the preflight reaches
 * the handlers like any other request. A CDN and an API that a browser app
 * can call both answer it this way. It is the initial handler, so
 * `resetHandlers()` keeps it.
 */
const corsPreflight = http.options("*", () => {
  return new HttpResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
      "Access-Control-Allow-Headers": "*",
    },
  });
});

export const server = setupServer(corsPreflight);

export const TEST_CDN_URL = "https://cdn.comvi.io/test-project-123";
export const TEST_PROJECT_ID = 456;
export const TEST_API_KEY = "test-api-key-789";

export const TEST_PROJECT_INFO: ProjectInfo = {
  id: TEST_PROJECT_ID,
  organizationId: 1,
  name: "Test Project",
  description: "Test project description",
  sourceLocale: "en",
};

/**
 * Every request no handler answered, as `METHOD url`. msw's built-in "error"
 * strategy lets "common assets" through to the real network, and `.json` is
 * one of them: the CDN catalogs a test forgot to mock would reach
 * cdn.comvi.io. A callback is applied to every frame instead. It records the
 * request and rejects it, so nothing leaves the machine, and `afterEach` fails
 * the test that made it.
 */
const unhandledRequests: string[] = [];

beforeAll(() => {
  server.listen({
    onUnhandledFrame: ({ frame }) => {
      const label =
        frame instanceof HttpNetworkFrame
          ? `${frame.data.request.method} ${frame.data.request.url}`
          : `${frame.protocol} frame`;
      unhandledRequests.push(label);
      throw new Error(`[MSW] no handler for ${label}`);
    },
  });
});

beforeEach(() => {
  clearProjectInfoCache();
  // Dev-mode tests resolve the project before requesting translations.
  server.use(
    http.get(/\/v1\/project$/, ({ request }) => {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new HttpResponse("Unauthorized", { status: 401 });
      }
      return HttpResponse.json(TEST_PROJECT_INFO);
    }),
  );
});

afterEach(() => {
  server.resetHandlers();
  const unhandled = unhandledRequests.splice(0);
  expect(unhandled, "requests no msw handler answered").toEqual([]);
});

afterAll(() => {
  server.close();
});

export function createMockTranslations(language: string) {
  return { key: `Value in ${language}` };
}

export function createMockApiResponse(
  locales: string[],
  namespaces: string[],
  translations?: Record<string, Record<string, Record<string, string>>>,
): ExportApiResponse {
  const response: ExportApiResponse = {
    locales,
    namespaces: {},
  };

  for (const ns of namespaces) {
    response.namespaces[ns] = {};
    for (const locale of locales) {
      response.namespaces[ns][locale] = translations?.[ns]?.[locale] || {
        key1: `Value 1 in ${locale}`,
        key2: `Value 2 in ${locale}`,
        "nested.key": `Nested value in ${locale}`,
      };
    }
  }

  return response;
}

export function buildTestCdnUrl(
  language: string,
  namespace: string,
  defaultNs: string = "default",
): string {
  if (namespace === defaultNs) {
    return `${TEST_CDN_URL}/${language}.json`;
  }
  return `${TEST_CDN_URL}/${namespace}/${language}.json`;
}

export function mockCdnSuccessResponse(
  language: string,
  namespace: string,
  data: Record<string, unknown>,
  defaultNs: string = "default",
) {
  const url = buildTestCdnUrl(language, namespace, defaultNs);
  server.use(
    http.get(url, () => {
      return HttpResponse.json(data);
    }),
  );
}

/**
 * Records the request the loader makes for one CDN key and answers it with
 * `data`. The returned object is filled in when the request arrives.
 */
export function captureCdnRequest(
  language: string,
  namespace: string,
  data: Record<string, unknown>,
  defaultNs: string = "default",
): { url?: string; headers?: Headers } {
  const captured: { url?: string; headers?: Headers } = {};
  server.use(
    http.get(buildTestCdnUrl(language, namespace, defaultNs), ({ request }) => {
      captured.url = request.url;
      captured.headers = request.headers;
      return HttpResponse.json(data);
    }),
  );
  return captured;
}

export function mockCdnErrorResponse(
  language: string,
  namespace: string,
  status: number,
  message?: string,
  defaultNs: string = "default",
) {
  const url = buildTestCdnUrl(language, namespace, defaultNs);
  server.use(
    http.get(url, () => {
      return new HttpResponse(message || "Error", { status });
    }),
  );
}

export interface DeferredResponse {
  /** Settles once the loader has actually issued the request. */
  requested: Promise<void>;
  /** Answers the in-flight request. Never calling it holds the request open forever. */
  resolve: (data: Record<string, unknown>) => void;
}

function deferredHandlerBody(): DeferredResponse & { body: () => Promise<Response> } {
  const requested = deferred<void>();
  const answer = deferred<Record<string, unknown>>();
  return {
    requested: requested.promise,
    resolve: answer.resolve,
    body: async () => {
      requested.resolve();
      return HttpResponse.json(await answer.promise);
    },
  };
}

/**
 * A CDN response the test releases by hand — the deterministic stand-in for a
 * slow network. Left unresolved it is a request that never arrives.
 */
export function mockCdnDeferredResponse(
  language: string,
  namespace: string,
  defaultNs: string = "default",
): DeferredResponse {
  const { requested, resolve, body } = deferredHandlerBody();
  server.use(http.get(buildTestCdnUrl(language, namespace, defaultNs), body));
  return { requested, resolve };
}

/** The `/v1/project` counterpart of {@link mockCdnDeferredResponse}. */
export function mockProjectInfoDeferredResponse(): DeferredResponse {
  const { requested, resolve, body } = deferredHandlerBody();
  server.use(http.get(/\/v1\/project$/, body));
  return { requested, resolve };
}

export function mockCdnNetworkError(
  language: string,
  namespace: string,
  defaultNs: string = "default",
) {
  const url = buildTestCdnUrl(language, namespace, defaultNs);
  server.use(
    http.get(url, () => {
      return HttpResponse.error();
    }),
  );
}

export function mockApiSuccessResponse(data: ExportApiResponse) {
  server.use(
    http.get(/\/v1\/translations/, () => {
      return HttpResponse.json(data);
    }),
  );
}

export function mockApiErrorResponse(status: number, message?: string) {
  server.use(
    http.get(/\/v1\/translations/, () => {
      return new HttpResponse(message || "Error", { status });
    }),
  );
}
