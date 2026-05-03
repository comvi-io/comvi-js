/**
 * Translation key encoding/decoding functions
 *
 * This module provides backward-compatible functions for encoding/decoding
 * translation keys using the TranslationKeyEncoder class.
 *
 * For new code, consider using TranslationKeyEncoder directly for better
 * isolation and testability.
 */

import {
  TranslationKeyEncoder,
  defaultEncoder,
  type KeyInfo,
} from "./encoding/TranslationKeyEncoder";
import { INVISIBLE_CHARS } from "./constants/encoding";

// Re-export the encoder class and default instance for direct usage
export { TranslationKeyEncoder, defaultEncoder, type KeyInfo };

/**
 * Registers a translation key with namespace and assigns it a sequential ID if not already registered
 * @param key - The translation key to register
 * @param ns - The namespace for the translation key (defaults to 'default')
 * @returns The numeric ID assigned to the key
 */
function registerKey(key: string, ns: string = "default"): number {
  return defaultEncoder.registerKey(key, ns);
}

/**
 * Looks up the original translation key and namespace from an ID
 * @param id - The numeric ID to look up
 * @returns Object with key and namespace, or null if not found
 */
function getKeyFromId(id: number): { key: string; ns: string } | null {
  return defaultEncoder.getKeyFromId(id);
}

/**
 * Encodes a numeric ID as a sequence of invisible characters with fixed length
 * @param id - The numeric ID to encode (from registerKey)
 * @returns A string of invisible Unicode characters representing the encoded ID
 */
function encodeKeyToInvisible(id: number): string {
  return defaultEncoder.encode(id);
}

/**
 * Scans a text string for fixed-length invisible character sequences and decodes them
 * @param text - Text potentially containing invisible character sequences
 * @returns Array of extracted translation key objects with namespace
 */
function scanForInvisibleKeys(text: string): ({ key: string; ns: string } | number)[] {
  return defaultEncoder.scanForKeys(text);
}

/**
 * Decodes a string containing invisible characters back to a translation key with namespace
 * @param text - Text potentially containing invisible characters
 * @returns The first extracted translation key object or null if none found
 */
function decodeInvisibleToKey(text: string): { key: string; ns: string } | number | null {
  return defaultEncoder.decode(text);
}

/**
 * Utility function to verify if text contains any invisible characters
 * @param text - Text to check for invisible characters
 * @returns Boolean indicating presence of invisible characters
 */
function containsInvisibleCharacters(text: string): boolean {
  return defaultEncoder.containsEncodedKey(text);
}

/**
 * Loads existing key-to-ID mappings from storage
 * @param mappings - Object containing the key-to-ID mappings
 */
function loadKeyMappings(mappings: Record<string, number>): void {
  defaultEncoder.loadMappings(mappings);
}

/**
 * Gets the current key-to-ID mappings for saving
 * @returns Object containing all current key-to-ID mappings
 */
function getKeyMappings(): Record<string, number> {
  return defaultEncoder.getMappings();
}

/**
 * Extracts all encoded IDs from a text string
 * @param text - Text potentially containing encoded IDs
 * @returns Array of extracted numeric IDs
 */
function extractAllIds(text: string): number[] {
  return defaultEncoder.extractAllIds(text);
}

/**
 * Resets the encoder to initial state
 * Useful for testing
 */
function resetEncoder(): void {
  defaultEncoder.reset();
}

// Export the functions for backward compatibility
export {
  encodeKeyToInvisible,
  decodeInvisibleToKey,
  scanForInvisibleKeys,
  containsInvisibleCharacters,
  registerKey,
  getKeyFromId,
  loadKeyMappings,
  getKeyMappings,
  extractAllIds,
  resetEncoder,
  INVISIBLE_CHARS,
};
