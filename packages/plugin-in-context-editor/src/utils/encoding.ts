/**
 * Encoding-related utility functions
 */

import { INVISIBLE_CHARS } from "../constants/encoding";

/**
 * Removes invisible Unicode characters from text
 * Used to extract visible text preview from encoded strings
 *
 * @param text - Text potentially containing invisible characters
 * @returns Clean text with invisible characters removed
 */
export function removeInvisibleCharacters(text: string): string {
  if (!text) return "";

  let result = text;
  for (const char of INVISIBLE_CHARS) {
    // Use replace with global regex instead of replaceAll for broader compatibility
    const regex = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    result = result.replace(regex, "");
  }

  return result.trim();
}
