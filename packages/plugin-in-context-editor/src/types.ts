/**
 * Core type definitions for the in-context editor
 */

/**
 * Language data from API response
 * Matches the API response from /v1/api/project/locales
 */
export interface LanguageResponse {
  id: number;
  code: string;
  name: string;
  nativeName: string;
}

/**
 * Enriched language configuration for internal usage
 * Extends API response with plural forms and source language flag
 */
export interface Language extends LanguageResponse {
  pluralForms: string[];
  isSource: boolean;
}

/**
 * Translation data for a single plural form
 */
export interface PluralFormTranslation {
  [form: string]: string;
}

/**
 * Select configuration for a single language
 * Used when a language uses ICU select format
 */
export interface LanguageSelectConfig {
  /** Whether select is enabled for this language */
  enabled: boolean;
  /** Variable name for ICU select format (e.g., "formality", "gender") */
  variable: string;
  /** Available select options (e.g., ["formal", "informal"]) */
  options: string[];
}

/**
 * Complete translation data for all languages
 */
export interface TranslationData {
  key: string | number;
  description?: string;
  isPlural: boolean;
  pluralVariable?: string; // Variable name for ICU plural format (e.g., "count", "n")
  translations: Record<string, PluralFormTranslation>;
  /** Per-language select configuration (language code → config) */
  selectConfigs?: Record<string, LanguageSelectConfig>;
  metadata?: {
    lastModified?: string;
    createdAt?: string;
    tags?: string[];
    context?: string;
  };
}

/**
 * Translation state for UI management
 */
export interface TranslationState {
  data: TranslationData | null;
  isLoading: boolean;
  error: string | null;
  isDirty: boolean; // Has unsaved changes
}

/**
 * Validation error for a translation
 */
export interface ValidationError {
  languageId: string;
  pluralForm: string;
  message: string;
}

/**
 * Translation validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Highlight style configuration for the visual overlay
 */
export interface HighlightStyleOptions {
  /** Border color (CSS color value, e.g., "#6366f1" or "red") */
  borderColor?: string;
  /** Background color (CSS color value, e.g., "rgba(99, 102, 241, 0.1)") */
  backgroundColor?: string;
  /** Border width in pixels */
  borderWidth?: number;
}

/**
 * Translation system options (external API)
 */
export interface TranslationSystemOptions {
  targetElement?: Node;
  tagAttributes?: TagAttributesConfig;
  debug?: boolean;
  /** Custom highlight style for the translation overlay */
  highlightStyle?: HighlightStyleOptions;
}

/**
 * Translation system internal options
 */
export interface TranslationSystemInnerOptions {
  targetElement: Node;
  tagAttributes: TagAttributesConfig;
}

/**
 * Tag attributes configuration
 * Maps HTML tag names to arrays of attribute names to watch
 */
export interface TagAttributesConfig {
  [tagName: string]: string[];
}

// EventBusEvents is defined in eventBus.ts for better type inference
// Re-export for backward compatibility
export type { EventBusEvents } from "./EventBus";
