import type { Language, LanguageResponse } from "../types";
import { isDemoMode } from "../config/api";
import { detectPluralCategories } from "../composables/usePluralRules";
import { apiFetch } from "./apiClient";

/**
 * Returns an empty array in demo mode (no API key) — the UI then shows a
 * simplified view. Successful results are enriched with plural forms.
 */
export async function getLanguages(scopeId?: string): Promise<Language[]> {
  if (isDemoMode(scopeId)) {
    return [];
  }

  try {
    const response = await apiFetch(scopeId, "/v1/project/locales", { method: "GET" });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const { sourceLocale, locales } = data;

    const languages = locales.map((lang: LanguageResponse): Language => ({
      ...lang,
      pluralForms: detectPluralCategories(lang.code),
      isSource: lang.code === sourceLocale,
    }));
    // Source first; the sort is stable, so the other languages keep the server's order.
    return languages.sort((a: Language, b: Language) => Number(b.isSource) - Number(a.isSource));
  } catch (error) {
    console.error("[@comvi/plugin-in-context-editor] Error fetching languages:", error);
    throw new Error("Failed to fetch languages");
  }
}
