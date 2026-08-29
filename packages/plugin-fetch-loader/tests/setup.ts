import { beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { delay, http, HttpResponse } from "msw";
import type { ExportApiResponse } from "../src/types";
import type { ProjectInfo } from "../src/index";
import { clearProjectInfoCache } from "../src/index";

export const server = setupServer();

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

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
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
});

afterAll(() => {
  server.close();
});

export function createMockTranslations(language: string, namespace: string) {
  return {
    [`${language}.${namespace}.key1`]: `Value 1 in ${language}`,
    [`${language}.${namespace}.key2`]: `Value 2 in ${language}`,
    [`${language}.${namespace}.nested.key`]: `Nested value in ${language}`,
  };
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
  data: any,
  defaultNs: string = "default",
) {
  const url = buildTestCdnUrl(language, namespace, defaultNs);
  server.use(
    http.get(url, () => {
      return HttpResponse.json(data);
    }),
  );
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

export function mockCdnDelayedResponse(
  language: string,
  namespace: string,
  delayMs: number,
  data: any,
  defaultNs: string = "default",
) {
  const url = buildTestCdnUrl(language, namespace, defaultNs);
  server.use(
    http.get(url, async () => {
      await delay(delayMs);
      return HttpResponse.json(data);
    }),
  );
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

export function mockApiSuccessResponse(
  language: string,
  namespaces: string[],
  data: ExportApiResponse,
) {
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
