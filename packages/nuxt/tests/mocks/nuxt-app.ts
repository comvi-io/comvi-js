import { ref, reactive, computed, customRef } from "vue";
import type {
  LocaleCookieConfig,
  LocaleDetectionConfig,
  NuxtI18nRuntimeConfig,
} from "../../src/types";
import { runtimeLocaleKeys } from "./locale-options";

const stateStore = new Map<string, any>();

/**
 * Typed as the module's own runtime-config shape, not inferred from the literal:
 * tests reassign `localePrefix`, `localeCookie` and `localeDetection` across
 * their full unions, which a literal-inferred type would pin to these defaults.
 */
const defaultRuntimeConfig: {
  public: { comvi: NuxtI18nRuntimeConfig["comvi"] };
  app: { baseURL: string };
} = {
  public: {
    comvi: {
      locales: ["en", "de", "uk"],
      localeObjects: {
        en: { code: "en", name: "English" },
        de: { code: "de", name: "Deutsch" },
        uk: { code: "uk", name: "Українська" },
      },
      defaultLocale: "en",
      localePrefix: "as-needed",
      ...runtimeLocaleKeys(),
    },
  },
  app: { baseURL: "/" },
};

const cloneRuntimeConfig = () => structuredClone(defaultRuntimeConfig);
let mockRuntimeConfig = cloneRuntimeConfig();

let mockRequestHeaders: Record<string, string> = {};

const cookieStore = new Map<string, ReturnType<typeof ref>>();
const cookieOptions = new Map<string, Record<string, unknown>>();
const cookieWrites = new Map<string, Array<string | undefined>>();

/**
 * A Nuxt cookie ref records every assignment, not only the ones that change the
 * value: writing an unchanged cookie still re-emits Set-Cookie.
 */
function createCookieRef(name: string) {
  let current: string | undefined;
  cookieWrites.set(name, []);
  return customRef<string | undefined>((track, trigger) => ({
    get() {
      track();
      return current;
    },
    set(next) {
      cookieWrites.get(name)!.push(next);
      current = next;
      trigger();
    },
  }));
}

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

/**
 * A stand-in instance whose `setLocale()` calls stay pending until the test settles each
 * one: `land(i)` shows call i's locale and resolves it, `fail(i)` rejects it (the locale on
 * screen stays), `resolve(i)` resolves it without switching (a superseded call in the core).
 */
export function deferredInstance(locale: string) {
  const calls: Array<{ target: string; resolve: () => void; reject: (e: Error) => void }> = [];
  const instance = {
    locale,
    get targets() {
      return calls.map((c) => c.target);
    },
    setLocale: (target: string) =>
      new Promise<void>((resolve, reject) => void calls.push({ target, resolve, reject })),
    land(i: number) {
      instance.locale = calls[i]!.target;
      calls[i]!.resolve();
    },
    resolve(i: number) {
      calls[i]!.resolve();
    },
    fail(i: number) {
      calls[i]!.reject(new Error("load_failed"));
    },
  };
  return instance;
}

/** A stand-in instance for the route middleware: its locale and a `setLocale()` that switches. */
export function fakeInstance(locale: string) {
  const instance = {
    locale,
    setLocale: async (next: string) => {
      instance.locale = next;
    },
  };
  return instance;
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

export function useCookie(name: string, options?: any) {
  // Only a real caller passes options; `setMockCookie` must not clear them.
  if (options !== undefined) {
    cookieOptions.set(name, options);
  }
  if (!cookieStore.has(name)) {
    cookieStore.set(name, createCookieRef(name));
  }
  return cookieStore.get(name)!;
}

/** Every assignment to the cookie, in order — including no-op rewrites. */
export function getMockCookieWrites(name: string) {
  return cookieWrites.get(name) ?? [];
}

/** The attributes the code under test asked Nuxt to write the cookie with. */
export function getMockCookieOptions(name: string) {
  return cookieOptions.get(name);
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

/**
 * As Nuxt's own (`app/composables/ssr.js`): the request's headers are matched
 * case-insensitively, and the returned object is keyed in LOWER case, whatever
 * case the caller asked in.
 */
export function useRequestHeaders(keys?: string[]) {
  const headers = Object.fromEntries(
    Object.entries(mockRequestHeaders).map(([name, value]) => [name.toLowerCase(), value]),
  );
  if (!keys) return headers;
  const result: Record<string, string> = {};
  for (const key of keys.map((name) => name.toLowerCase())) {
    if (headers[key]) {
      result[key] = headers[key];
    }
  }
  return result;
}

export function useHead(config: any) {
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

/** What the module writes into runtime config for these options. */
export function setLocaleOptions(
  settings: {
    localeCookie?: LocaleCookieConfig;
    localeDetection?: false | LocaleDetectionConfig;
  } = {},
) {
  Object.assign(mockRuntimeConfig.public.comvi, runtimeLocaleKeys(settings));
}

function resetRuntimeConfig() {
  mockRuntimeConfig = cloneRuntimeConfig();
}

export function resetMocks() {
  stateStore.clear();
  mockNuxtApp.$i18n = null;
  // What the module's runtime keeps on the app: its one cookie ref, the navigation count.
  for (const key of ["_comviLocaleCookie", "_comviNavigating", "_comviNavigation", "payload"])
    delete (mockNuxtApp as Record<string, unknown>)[key];
  cookieStore.clear();
  cookieOptions.clear();
  cookieWrites.clear();
  mockRequestHeaders = {};
  routerResolveOverride = null;
  resetRuntimeConfig();
  Object.assign(routeState, defaultRouteState);
}

// Live binding: `resetRuntimeConfig` reassigns it, which is what makes
// `resetMocks()` reach importers.
export { mockRuntimeConfig };
