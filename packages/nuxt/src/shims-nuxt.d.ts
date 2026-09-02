type ComviRuntimeConfig = {
  public: import("./types").NuxtI18nRuntimeConfig & {
    [key: string]: unknown;
  };
  comvi: import("./types").NuxtI18nPrivateRuntimeConfig["comvi"] & {
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type NuxtRouteLike = {
  path: string;
  fullPath: string;
  params: Record<string, string | string[] | undefined>;
  query?: Record<string, string | (string | null)[] | null | undefined>;
};

interface ImportMeta {
  dev: boolean;
  server: boolean;
  hot?: {
    dispose(callback: () => void): void;
  };
}

declare namespace NodeJS {
  interface Process {
    dev?: boolean;
  }
}

declare module "#app" {
  export interface NuxtPayload {
    state?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface NuxtApp {
    vueApp: {
      use(plugin: unknown): unknown;
    };
    payload: NuxtPayload;
    hook(name: string, callback: (...args: unknown[]) => unknown): void;
    $i18n: import("@comvi/vue").AnyVueI18n;
    [key: string]: unknown;
  }

  // Both helpers return what they are handed — Nuxt's real signatures are
  // identity-shaped. Returning `unknown` here erased the call signature of
  // every plugin and middleware module's default export, so every consumer of
  // one had to cast before invoking it.
  export function defineNuxtPlugin<
    P extends {
      name?: string;
      enforce?: string;
      setup?: (nuxtApp: NuxtApp) => unknown;
    },
  >(plugin: P): P;

  export function defineNuxtRouteMiddleware<
    M extends (to: NuxtRouteLike, from?: NuxtRouteLike) => unknown,
  >(middleware: M): M;

  export function useRuntimeConfig(): ComviRuntimeConfig;
  export function useState<T>(key: string, init?: () => T): import("vue").Ref<T>;
  export function useCookie<T = string>(
    name: string,
    options?: Record<string, unknown>,
  ): import("vue").Ref<T | null | undefined>;
  export function useNuxtApp(): NuxtApp;
  export function useRequestHeaders(names?: string[]): Record<string, string | undefined>;
  export function navigateTo(
    to: string,
    options?: {
      redirectCode?: number;
    },
  ): unknown;
  export function useRoute(): NuxtRouteLike;
  export function useRouter(): {
    resolve(to: import("vue-router").RouteLocationRaw): import("vue-router").RouteLocationResolved;
  };
  export function useHead(input: unknown): void;
  export function useRequestURL(): URL;
}

declare module "#components" {
  export const NuxtLink: import("vue").Component;
}
