/**
 * Mock Nuxt app composables for testing
 */
import { ref, reactive, computed } from "vue";

// Mock state store
const stateStore = new Map<string, any>();

// Mock runtime config
const defaultRuntimeConfig = {
  public: {
    comvi: {
      locales: ["en", "de", "uk"],
      localeObjects: {
        en: { code: "en", name: "English" },
        de: { code: "de", name: "Deutsch" },
        uk: { code: "uk", name: "Українська" },
      },
      defaultLocale: "en",
      localePrefix: "as-needed" as const,
      cookieName: "i18n_locale",
      cdnUrl: "https://cdn.example.com",
      apiBaseUrl: "https://api.example.com",
      defaultNs: "default",
      fallbackLanguage: "en",
      basicHtmlTags: ["strong", "em"],
      detectBrowserLanguage: {
        useCookie: true,
        cookieName: "i18n_locale",
        cookieMaxAge: 31536000,
        redirectOnFirstVisit: true,
        fallbackLocale: "en",
      },
    },
  },
  comvi: {
    apiKey: undefined,
  },
};

const cloneRuntimeConfig = () => structuredClone(defaultRuntimeConfig);
let mockRuntimeConfig = cloneRuntimeConfig();

// Mock request headers
let mockRequestHeaders: Record<string, string> = {};

// Mock cookies
const cookieStore = new Map<string, ReturnType<typeof ref>>();

// Mock route state
const defaultRouteState = {
  path: "/",
  params: {},
  query: {},
  hash: "",
  fullPath: "/",
  matched: [],
  name: undefined as undefined | string,
  redirectedFrom: undefined as undefined | string,
  meta: {},
};
const routeState = reactive({ ...defaultRouteState });

// Mock Nuxt app
const mockNuxtApp = {
  $i18n: null as any,
  provide: (key: string, value: any) => {
    (mockNuxtApp as any)[`$${key}`] = value;
  },
  vueApp: {
    use: () => {},
  },
};

export function useNuxtApp() {
  return mockNuxtApp;
}

export function setMockI18n(i18n: any) {
  mockNuxtApp.$i18n = i18n;
}

export function useState<T>(key: string, init?: () => T) {
  if (!stateStore.has(key)) {
    stateStore.set(key, ref(init ? init() : undefined));
  }
  return stateStore.get(key);
}

export function useRuntimeConfig() {
  return mockRuntimeConfig;
}

export function useCookie(name: string, _options?: any) {
  if (!cookieStore.has(name)) {
    cookieStore.set(name, ref<string | undefined>(undefined));
  }
  return cookieStore.get(name)!;
}

export function useRoute() {
  return routeState;
}

const stringifyQuery = (query?: Record<string, unknown>) => {
  if (!query) return "";
  const entries: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        entries.push(`${key}=${String(item)}`);
      }
    } else if (value !== undefined) {
      entries.push(`${key}=${String(value)}`);
    }
  }
  return entries.length > 0 ? `?${entries.join("&")}` : "";
};

let routerResolveOverride: ((to: any) => any) | null = null;

export function setRouterResolveOverride(fn: ((to: any) => any) | null) {
  routerResolveOverride = fn;
}

export function useRouter() {
  return {
    push: () => Promise.resolve(),
    replace: () => Promise.resolve(),
    go: () => {},
    back: () => {},
    forward: () => {},
    resolve: (to: any) => {
      if (routerResolveOverride) return routerResolveOverride(to);
      if (typeof to === "string") {
        return { fullPath: to, path: to, href: to };
      }

      const basePath =
        typeof to?.path === "string"
          ? to.path
          : typeof to?.name === "string"
            ? `/${to.name.split("___")[0]}`
            : "/";

      const queryStr = stringifyQuery(to?.query);
      const hashStr = to?.hash
        ? String(to.hash).startsWith("#")
          ? String(to.hash)
          : `#${to.hash}`
        : "";

      const fullPath = `${basePath}${queryStr}${hashStr}`;

      return { fullPath, path: basePath, href: fullPath };
    },
    currentRoute: useRoute(),
  };
}

export function useRequestURL() {
  return new URL("https://example.com/");
}

export function useRequestHeaders(keys?: string[]) {
  if (!keys) return mockRequestHeaders;
  const result: Record<string, string> = {};
  for (const key of keys) {
    if (mockRequestHeaders[key]) {
      result[key] = mockRequestHeaders[key];
    }
  }
  return result;
}

export function useHead(config: any) {
  // Mock useHead - just returns the config
  return computed(() => config.value || config);
}

export function navigateTo(path: string, options?: any) {
  return { path, ...options };
}

export function defineNuxtPlugin(plugin: any) {
  return plugin;
}

export function defineNuxtRouteMiddleware(middleware: any) {
  return middleware;
}

export function setMockRequestHeaders(headers: Record<string, string>) {
  mockRequestHeaders = { ...headers };
}

export function setMockCookie(name: string, value: string | undefined) {
  const cookie = useCookie(name);
  cookie.value = value;
}

export function setMockRoute(partial: Partial<typeof routeState>) {
  Object.assign(routeState, partial);
}

export function setMockRuntimeConfig(partial: Partial<typeof mockRuntimeConfig>) {
  mockRuntimeConfig = { ...mockRuntimeConfig, ...partial };
}

export function resetRuntimeConfig() {
  mockRuntimeConfig = cloneRuntimeConfig();
}

// Reset mocks between tests
export function resetMocks() {
  stateStore.clear();
  mockNuxtApp.$i18n = null;
  cookieStore.clear();
  mockRequestHeaders = {};
  routerResolveOverride = null;
  resetRuntimeConfig();
  Object.assign(routeState, defaultRouteState);
}

export { mockRuntimeConfig, mockNuxtApp };
