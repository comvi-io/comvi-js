import { INVISIBLE_CHARS } from "../constants/encoding";

/** Strips the encoding to leave the visible text preview. */
export function removeInvisibleCharacters(text: string): string {
  if (!text) return "";

  let result = text;
  for (const char of INVISIBLE_CHARS) {
    // `replace` + global regex, not `replaceAll`: broader browser support.
    const regex = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    result = result.replace(regex, "");
  }

  return result.trim();
}
