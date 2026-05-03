/**
 * API translations response format
 * Endpoint: GET /v1/translations
 */
export interface ExportApiResponse {
  locales: string[];
  namespaces: {
    [namespace: string]: {
      [locale: string]: Record<string, string>;
    };
  };
}

/**
 * Internal cache structure for dev mode
 * Key format: "locale:namespace"
 */
export type TranslationStore = Map<string, Record<string, string>>;
