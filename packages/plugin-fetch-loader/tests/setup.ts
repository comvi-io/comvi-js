import { beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { delay, http, HttpResponse } from "msw";
import type { ExportApiResponse } from "../src/types";
import type { ProjectInfo } from "../src/index";
import { clearProjectInfoCache } from "../src/index";

// Create MSW server for mocking HTTP requests
export const server = setupServer();

// Default test configuration
export const TEST_CDN_URL = "https://cdn.comvi.io/test-project-123";
export const TEST_PROJECT_ID = 456; // Now a number from API
export const TEST_API_KEY = "test-api-key-789";

// Mock project info response
export const TEST_PROJECT_INFO: ProjectInfo = {
  id: TEST_PROJECT_ID,
  organizationId: 1,
  name: "Test Project",
  description: "Test project description",
  sourceLocale: "en",
};

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

// Clear project info cache and set up default handlers before each test
beforeEach(() => {
  clearProjectInfoCache();
  // Default handler for project info API (needed for dev mode tests)
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

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => {
  server.close();
});

// Helper to create mock translation data for CDN format (flat object)
export function createMockTranslations(language: string, namespace: string) {
  return {
    [`${language}.${namespace}.key1`]: `Value 1 in ${language}`,
    [`${language}.${namespace}.key2`]: `Value 2 in ${language}`,
    [`${language}.${namespace}.nested.key`]: `Nested value in ${language}`,
  };
}

// Helper to create mock API export response
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

// Build CDN URL for testing
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

// Helper to setup CDN success response
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

// Helper to setup CDN error response
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

// Helper to setup delayed CDN response
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

// Helper to setup CDN network error
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

// Helper to setup API success response
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

// Helper to setup API error response
export function mockApiErrorResponse(status: number, message?: string) {
  server.use(
    http.get(/\/v1\/translations/, () => {
      return new HttpResponse(message || "Error", { status });
    }),
  );
}
