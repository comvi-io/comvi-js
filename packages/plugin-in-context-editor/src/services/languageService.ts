/**
 * Language Service
 * Handles fetching available languages from the API
 */

import type { Language, LanguageResponse } from "../types";
import { isDemoMode } from "../config/api";
import { detectPluralCategories } from "../composables/usePluralRules";
import { getHeaders, getBaseUrl } from "./apiClient";

/**
 * Fetch available languages/locales from the API.
 * In demo mode (no API key), returns empty array - the UI will show a simplified view.
 * @param scopeId - Optional runtime scope used to isolate editor instances
 * @returns Array of available languages enriched with plural forms
 */
export async function getLanguages(scopeId?: string): Promise<Language[]> {
  // In demo mode, return empty array - the UI shows a simplified view
  if (isDemoMode(scopeId)) {
    return [];
  }

  try {
    const baseUrl = getBaseUrl(scopeId);
    const response = await fetch(`${baseUrl}/v1/project/locales`, {
      method: "GET",
      headers: getHeaders(scopeId),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const { sourceLocale, locales } = data;

    // Enrich each language with plural forms and isSource flag
    return locales.map(
      (lang: LanguageResponse): Language => ({
        ...lang,
        pluralForms: detectPluralCategories(lang.code),
        isSource: lang.code === sourceLocale,
      }),
    );
  } catch (error) {
    console.error("Error fetching languages:", error);
    throw new Error("Failed to fetch languages");
  }
}
