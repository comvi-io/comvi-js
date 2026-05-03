/**
 * Configuration exports
 *
 * Centralized configuration for the in-context editor.
 */

// Highlight/visual configuration
export * from "./highlight";

// API configuration
export { initApiConfig, getApiConfig, isDemoMode, resetApiConfig, type ApiConfig } from "./api";
