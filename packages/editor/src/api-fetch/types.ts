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
 * Internal cache structure for the API path (the i18n instance has an `apiKey`)
 * Key format: "locale:namespace"
 */
export type TranslationStore = Map<string, Record<string, string>>;
