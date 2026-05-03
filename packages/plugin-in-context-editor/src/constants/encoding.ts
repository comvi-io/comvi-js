/**
 * Encoding constants for invisible character key encoding
 * Centralized source of truth for all encoding-related constants
 */

/**
 * Unicode invisible characters used for encoding translation keys
 * These characters are visually invisible but can be detected and decoded
 */
export const INVISIBLE_CHARS = [
  "\u200B", // ZERO WIDTH SPACE
  "\u200D", // WORD JOINER
  "\u200C", // ZERO WIDTH NON-JOINER
  "\u2063", // INVISIBLE SEPARATOR
  "\u2064", // INVISIBLE PLUS
] as const;

/**
 * Length of the invisible character encoding in characters
 * Using base-5 encoding (5 invisible chars), 8 characters supports 5^8 = 390,625 keys
 */
export const ENCODING_LENGTH = 8;

/**
 * Maximum supported translation keys
 * Calculated as 5^ENCODING_LENGTH = 390,625
 */
export const MAX_TRANSLATION_KEYS = Math.pow(INVISIBLE_CHARS.length, ENCODING_LENGTH);

/**
 * Type for invisible character (one of the defined chars)
 */
export type InvisibleChar = (typeof INVISIBLE_CHARS)[number];
