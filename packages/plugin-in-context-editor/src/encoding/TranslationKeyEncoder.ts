/**
 * TranslationKeyEncoder - Encapsulated translation key encoding/decoding
 *
 * Encodes translation keys as invisible Unicode characters for embedding in translated text.
 * Each key is assigned a numeric ID, which is then encoded as a base-5 number using
 * 5 invisible Unicode characters.
 */

import { INVISIBLE_CHARS, ENCODING_LENGTH } from "../constants/encoding";
import type { KeyInfo } from "../types/translation";

// Re-export KeyInfo for convenience
export type { KeyInfo };

/**
 * TranslationKeyEncoder class for managing translation key encoding/decoding
 *
 * Unlike the old module-level implementation, this class:
 * - Encapsulates state (no global variables)
 * - Allows multiple independent instances
 * - Supports reset for testing
 */
export class TranslationKeyEncoder {
  private keyToIdMap: Map<string, number> = new Map();
  private idToKeyMap: Map<number, string> = new Map();
  private nextId: number = 1;

  /**
   * Registers a translation key with namespace and assigns it a sequential ID
   * @param key - The translation key to register
   * @param ns - The namespace for the translation key (defaults to 'default')
   * @returns The numeric ID assigned to the key
   */
  public registerKey(key: string, ns: string = "default"): number {
    const combinedKey = `${ns}:${key}`;

    const existingId = this.keyToIdMap.get(combinedKey);
    if (existingId !== undefined) {
      return existingId;
    }

    const id = this.nextId++;
    this.keyToIdMap.set(combinedKey, id);
    this.idToKeyMap.set(id, combinedKey);

    return id;
  }

  /**
   * Looks up the original translation key and namespace from an ID
   * @param id - The numeric ID to look up
   * @returns Object with key and namespace, or null if not found
   */
  public getKeyFromId(id: number): KeyInfo | null {
    const combinedKey = this.idToKeyMap.get(id);
    if (!combinedKey) return null;

    // Split only on the first colon to handle keys with colons in them
    const colonIndex = combinedKey.indexOf(":");
    if (colonIndex === -1) {
      return { key: combinedKey, ns: "default" };
    }

    const ns = combinedKey.slice(0, colonIndex);
    const key = combinedKey.slice(colonIndex + 1);

    return { key, ns };
  }

  /**
   * Encodes a numeric ID as a sequence of invisible characters with fixed length
   * @param id - The numeric ID to encode
   * @returns A string of invisible Unicode characters
   */
  public encode(id: number): string {
    let encodedKey = this.numberToBase5(id);

    // Pad with leading zeros to ensure fixed length
    while (encodedKey.length < ENCODING_LENGTH) {
      encodedKey = INVISIBLE_CHARS[0] + encodedKey;
    }

    return encodedKey;
  }

  /**
   * Decodes text to find the first encoded translation key
   * @param text - Text potentially containing invisible characters
   * @returns The decoded key info, numeric ID if key not found, or null
   */
  public decode(text: string): KeyInfo | number | null {
    const keys = this.scanForKeys(text);
    return keys.length > 0 ? keys[0]! : null;
  }

  /**
   * Scans text for all encoded translation keys
   * @param text - Text potentially containing invisible character sequences
   * @returns Array of decoded key info or numeric IDs
   */
  public scanForKeys(text: string): (KeyInfo | number)[] {
    const result: (KeyInfo | number)[] = [];

    for (let i = 0; i <= text.length - ENCODING_LENGTH; i++) {
      let isEncodedKey = true;

      // Check if we have a sequence of ENCODING_LENGTH invisible characters
      for (let j = 0; j < ENCODING_LENGTH; j++) {
        const char = text[i + j];
        if (!INVISIBLE_CHARS.includes(char as (typeof INVISIBLE_CHARS)[number])) {
          isEncodedKey = false;
          break;
        }
      }

      if (isEncodedKey) {
        const encodedKey = text.substring(i, i + ENCODING_LENGTH);
        const id = this.base5ToNumber(encodedKey);
        result.push(this.getKeyFromId(id) || id);
        i += ENCODING_LENGTH - 1; // Skip ahead
      }
    }

    return result;
  }

  /**
   * Checks if text contains any invisible character encodings
   * @param text - Text to check
   * @returns True if text contains invisible characters
   */
  public containsEncodedKey(text: string): boolean {
    return INVISIBLE_CHARS.some((char) => text.includes(char));
  }

  /**
   * Extracts all encoded IDs from text (including interleaved ones)
   * @param text - Text potentially containing encoded IDs
   * @returns Array of numeric IDs found
   */
  public extractAllIds(text: string): number[] {
    // Extract all invisible characters
    let invisibleChars = "";
    for (let i = 0; i < text.length; i++) {
      if (INVISIBLE_CHARS.includes(text[i] as (typeof INVISIBLE_CHARS)[number])) {
        invisibleChars += text[i];
      }
    }

    const result: number[] = [];

    for (let i = 0; i <= invisibleChars.length - ENCODING_LENGTH; i++) {
      const encodedPart = invisibleChars.substring(i, i + ENCODING_LENGTH);
      let isValidEncoding = true;

      for (let j = 0; j < encodedPart.length; j++) {
        if (!INVISIBLE_CHARS.includes(encodedPart[j] as (typeof INVISIBLE_CHARS)[number])) {
          isValidEncoding = false;
          break;
        }
      }

      if (isValidEncoding) {
        const id = this.base5ToNumber(encodedPart);
        result.push(id);
        i += ENCODING_LENGTH - 1;
      }
    }

    return result;
  }

  /**
   * Loads existing key-to-ID mappings
   * @param mappings - Object containing key-to-ID mappings
   */
  public loadMappings(mappings: Record<string, number>): void {
    this.keyToIdMap.clear();
    this.idToKeyMap.clear();

    let maxId = 0;

    Object.entries(mappings).forEach(([key, id]) => {
      this.keyToIdMap.set(key, id);
      this.idToKeyMap.set(id, key);
      maxId = Math.max(maxId, id);
    });

    this.nextId = maxId + 1;
  }

  /**
   * Gets the current key-to-ID mappings for saving
   * @returns Object containing all current mappings
   */
  public getMappings(): Record<string, number> {
    const mappings: Record<string, number> = {};
    this.keyToIdMap.forEach((id, key) => {
      mappings[key] = id;
    });
    return mappings;
  }

  /**
   * Resets the encoder to initial state
   * Useful for testing or reinitializing
   */
  public reset(): void {
    this.keyToIdMap.clear();
    this.idToKeyMap.clear();
    this.nextId = 1;
  }

  /**
   * Converts a number to base-5 representation using invisible characters
   */
  private numberToBase5(num: number): string {
    if (num === 0) return INVISIBLE_CHARS[0]!;

    let result = "";
    while (num > 0) {
      const remainder = num % 5;
      result = INVISIBLE_CHARS[remainder] + result;
      num = Math.floor(num / 5);
    }

    return result;
  }

  /**
   * Converts a base-5 representation back to a number
   */
  private base5ToNumber(base5Str: string): number {
    let result = 0;

    for (let i = 0; i < base5Str.length; i++) {
      const digit = INVISIBLE_CHARS.indexOf(base5Str[i] as (typeof INVISIBLE_CHARS)[number]);
      if (digit === -1) continue;
      result = result * 5 + digit;
    }

    return result;
  }
}

/**
 * Default encoder instance for backward compatibility
 * New code should create its own instance for better isolation
 */
export const defaultEncoder = new TranslationKeyEncoder();
