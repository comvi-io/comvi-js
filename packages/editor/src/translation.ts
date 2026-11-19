/**
 * Backward-compatible function wrappers over the shared `defaultEncoder`.
 * New code should use `TranslationKeyEncoder` directly — its own instance is
 * isolated and testable.
 */

import {
  TranslationKeyEncoder,
  defaultEncoder,
  type KeyInfo,
} from "./encoding/TranslationKeyEncoder";
import { INVISIBLE_CHARS } from "./constants/encoding";

export { TranslationKeyEncoder, defaultEncoder, type KeyInfo };

/** Assigns a sequential ID the first time this key/namespace pair is seen. */
function registerKey(key: string, ns: string = "default"): number {
  return defaultEncoder.registerKey(key, ns);
}

function getKeyFromId(id: number): { key: string; ns: string } | null {
  return defaultEncoder.getKeyFromId(id);
}

/** Encodes the ID as a FIXED-LENGTH run of invisible Unicode characters. */
function encodeKeyToInvisible(id: number): string {
  return defaultEncoder.encode(id);
}

/** Finds every fixed-length invisible sequence in the text and decodes it. */
function scanForInvisibleKeys(text: string): ({ key: string; ns: string } | number)[] {
  return defaultEncoder.scanForKeys(text);
}

/** Decodes only the FIRST encoded key in the text. */
function decodeInvisibleToKey(text: string): { key: string; ns: string } | number | null {
  return defaultEncoder.decode(text);
}

function containsInvisibleCharacters(text: string): boolean {
  return defaultEncoder.containsEncodedKey(text);
}

function loadKeyMappings(mappings: Record<string, number>): void {
  defaultEncoder.loadMappings(mappings);
}

function getKeyMappings(): Record<string, number> {
  return defaultEncoder.getMappings();
}

function extractAllIds(text: string): number[] {
  return defaultEncoder.extractAllIds(text);
}

function resetEncoder(): void {
  defaultEncoder.reset();
}

// Kept for backward compatibility.
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
