/** Shape returned by `/v1/api/project/locales`. */
export interface LanguageResponse {
  id: number;
  code: string;
  name: string;
  nativeName: string;
}

export interface Language extends LanguageResponse {
  pluralForms: string[];
  isSource: boolean;
}

export interface PluralFormTranslation {
  [form: string]: string;
}

/** Per-language ICU `select` configuration. */
export interface LanguageSelectConfig {
  /** Whether select is enabled for this language */
  enabled: boolean;
  /** Variable name for ICU select format (e.g., "formality", "gender") */
  variable: string;
  /** Available select options (e.g., ["formal", "informal"]) */
  options: string[];
}

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

export interface TranslationState {
  data: TranslationData | null;
  isLoading: boolean;
  error: string | null;
  isDirty: boolean; // Has unsaved changes
}

export interface ValidationError {
  languageId: string;
  pluralForm: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface HighlightStyleOptions {
  /** Border color (CSS color value, e.g., "#6366f1" or "red") */
  borderColor?: string;
  /** Background color (CSS color value, e.g., "rgba(99, 102, 241, 0.1)") */
  backgroundColor?: string;
  /** Border width in pixels */
  borderWidth?: number;
}

export interface TranslationSystemOptions {
  targetElement?: Node;
  tagAttributes?: TagAttributesConfig;
  debug?: boolean;
  /** Custom highlight style for the translation overlay */
  highlightStyle?: HighlightStyleOptions;
  /**
   * Passive context collection inside an active ICE session (extension
   * channel only — see `@comvi/plugin-in-context-editor/collector`).
   * Defaults to enabled; set false to opt out.
   */
  collectContext?: boolean;
  /**
   * Overrides the collector's screen grouping with a stable, PII-free route
   * template for the current URL (e.g. "/users/:id"). Without it, screens
   * are grouped by an opaque digest of the normalized route. Return
   * null/undefined to fall back to the digest for a given URL.
   */
  screenGroupResolver?: () => string | null | undefined;
}

export interface TranslationSystemInnerOptions {
  targetElement: Node;
  tagAttributes: TagAttributesConfig;
}

/** HTML tag name → the attributes to watch on it. */
export interface TagAttributesConfig {
  [tagName: string]: string[];
}

// Defined in eventBus.ts for better type inference; re-exported here for
// backward compatibility.
export type { EventBusEvents } from "./EventBus";
