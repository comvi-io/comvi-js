/** The five digits of the base-5 encoding: invisible, but detectable. */
export const INVISIBLE_CHARS = [
  "\u200B", // ZERO WIDTH SPACE
  "\u200D", // WORD JOINER
  "\u200C", // ZERO WIDTH NON-JOINER
  "\u2063", // INVISIBLE SEPARATOR
  "\u2064", // INVISIBLE PLUS
] as const;

/** 8 base-5 digits — 5^8 = 390,625 distinct keys. */
export const ENCODING_LENGTH = 8;

export const MAX_TRANSLATION_KEYS = Math.pow(INVISIBLE_CHARS.length, ENCODING_LENGTH);

export type InvisibleChar = (typeof INVISIBLE_CHARS)[number];
