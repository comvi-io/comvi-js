type ComviRuntimeConfig = {
  public: import("./types").NuxtI18nRuntimeConfig & {
    [key: string]: unknown;
  };
  app?: { baseURL?: string };
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
    serverRendered?: boolean;
    [key: string]: unknown;
  }

  export interface NuxtApp {
    vueApp: {
      use(plugin: unknown): unknown;
      runWithContext<T>(fn: () => T): T;
    };
    payload: NuxtPayload;
    /**
     * Server only, and the reason it is declared here: the app plugin hands its
     * per-request instance to the Nitro teardown through this event's context.
     * Nuxt's own type has `event` required; optional is the safer shim.
     */
    ssrContext?: { event?: import("h3").H3Event; url?: string; [key: string]: unknown };
    hook(name: string, callback: (...args: unknown[]) => unknown): void;
    $i18n: import("@comvi/vue").VueI18n;
    isHydrating?: boolean;
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
    afterEach(
      hook: (to: unknown, from: unknown, failure?: { type: number } | void) => void,
    ): () => void;
    onError(hook: () => void): () => void;
  };
  export function useHead(input: unknown): void;
  export function createError(input: {
    statusCode: number;
    statusMessage?: string;
    fatal?: boolean;
  }): Error;
  export function useRequestURL(): URL;
}

declare module "#components" {
  export const NuxtLink: import("vue").Component;
}

// Nitro's auto-import entry, as the server utilities see it. Only the one
// function they call; the real module is Nitro's own virtual `#imports`.
declare module "#imports" {
  export function useRuntimeConfig(event?: import("h3").H3Event): unknown;
}
