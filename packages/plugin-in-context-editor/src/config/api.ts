/**
 * API Configuration Module
 *
 * The editor only ever talks to the Comvi platform API, so the base URL is
 * baked at library build time from `import.meta.env.VITE_API_BASE_URL`
 * (Vite/Astro substitute it during `pnpm build`). It is not a runtime option
 * — consumers should not be able to point the editor at a different host.
 */

/**
 * Minimal request init accepted by an API transport. Headers are deliberately
 * excluded: in transport mode authentication is attached outside the page
 * context (e.g. by the extension service worker), never in the MAIN world.
 */
export interface ApiTransportInit {
  method?: string;
  body?: string;
  keepalive?: boolean;
  /** Caller-side cancellation; transports should abort the underlying request. */
  signal?: AbortSignal;
}

/**
 * Pluggable API transport. Receives a path relative to the API base URL
 * (e.g. "/v1/keys") and returns a standard Response. Used by the Chrome
 * extension to proxy authenticated requests through its service worker so
 * the API key never enters the page's JavaScript context.
 */
export type ApiTransport = (path: string, init?: ApiTransportInit) => Promise<Response>;

/**
 * API Configuration interface
 */
export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  demoMode: boolean;
  transport?: ApiTransport;
}

/**
 * Options for initApiConfig
 */
export interface InitApiConfigOptions {
  /** Proxy transport for all API requests. When set, no API key is kept in-page. */
  transport?: ApiTransport;
  /**
   * Base URL used only for building request paths/UI in transport mode.
   * Non-secret. The actual request target is decided by the transport owner.
   */
  baseUrl?: string;
}

/**
 * Internal configuration state
 */
const DEFAULT_CONFIG_SCOPE = "__default__";
const configs = new Map<string, ApiConfig>();

function getConfigScope(scopeId?: string): string {
  return scopeId ?? DEFAULT_CONFIG_SCOPE;
}

/**
 * Initialize API configuration
 * This should be called once by the plugin when it initializes
 *
 * @param apiKey - API key for authentication (optional - demo mode if not provided)
 * @param scopeId - Optional runtime scope. Use this to isolate multiple editor runtimes.
 */
export function initApiConfig(
  apiKey?: string,
  scopeId?: string,
  options?: InitApiConfigOptions,
): void {
  const transport = options?.transport;

  if (transport) {
    // Proxy mode (Chrome extension): authentication happens outside the page.
    // No API key is stored in the page context, and this is not demo mode.
    configs.set(getConfigScope(scopeId), {
      apiKey: "",
      baseUrl: options?.baseUrl ? stripTrailingSlash(options.baseUrl) : resolveBaseUrl(),
      demoMode: false,
      transport,
    });
    return;
  }

  // Demo mode if no API key provided
  const isDemoMode = !apiKey;

  // In demo mode, use a placeholder URL (requests will be blocked anyway)
  const baseUrl = isDemoMode ? "https://demo.comvi.dev" : resolveBaseUrl();

  const config = {
    apiKey: apiKey || "",
    baseUrl,
    demoMode: isDemoMode,
  };

  configs.set(getConfigScope(scopeId), config);

  if (isDemoMode) {
    console.info(
      "[InContextEditor] Running in demo mode - API key not configured. Changes cannot be saved.",
    );
  }
}

/**
 * Get the current API configuration
 * @param scopeId - Optional runtime scope. Defaults to the shared scope for backward compatibility.
 * @throws Error if configuration hasn't been initialized
 */
export function getApiConfig(scopeId?: string): ApiConfig {
  const config = configs.get(getConfigScope(scopeId));
  if (!config) {
    throw new Error(
      "[InContextEditor] API configuration not initialized. Make sure the plugin is properly configured.",
    );
  }
  return config;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function resolveBaseUrl(): string {
  // VITE_API_BASE_URL is substituted at library build time. Falls through to
  // the public production API for runtimes/builds where it isn't defined.
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (envBaseUrl) {
    return stripTrailingSlash(envBaseUrl);
  }

  return "https://api.comvi.io";
}

/**
 * Check if the editor is running in demo mode (no API key configured)
 * @param scopeId - Optional runtime scope. Defaults to the shared scope for backward compatibility.
 * @returns true if in demo mode
 */
export function isDemoMode(scopeId?: string): boolean {
  const config = configs.get(getConfigScope(scopeId));
  if (config) {
    return config.demoMode;
  }

  return false;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetApiConfig(scopeId?: string): void {
  if (scopeId !== undefined) {
    configs.delete(getConfigScope(scopeId));
    return;
  }

  configs.clear();
}
