/**
 * Each key gets a numeric ID, encoded as a base-5 number over 5 invisible
 * Unicode characters and embedded in the translated text.
 */

import { INVISIBLE_CHARS, ENCODING_LENGTH } from "../constants/encoding";
import type { KeyInfo } from "../types/translation";

export type { KeyInfo };

export class TranslationKeyEncoder {
  private keyToIdMap: Map<string, number> = new Map();
  private idToKeyMap: Map<number, string> = new Map();
  private nextId: number = 1;

  /** Assigns a sequential ID the first time this key/namespace pair is seen. */
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

  /** Always emits exactly ENCODING_LENGTH characters. */
  public encode(id: number): string {
    let encodedKey = this.numberToBase5(id);

    while (encodedKey.length < ENCODING_LENGTH) {
      encodedKey = INVISIBLE_CHARS[0] + encodedKey;
    }

    return encodedKey;
  }

  /** Decodes the FIRST key only, falling back to the raw ID if unregistered. */
  public decode(text: string): KeyInfo | number | null {
    const keys = this.scanForKeys(text);
    return keys.length > 0 ? keys[0]! : null;
  }

  public scanForKeys(text: string): (KeyInfo | number)[] {
    const result: (KeyInfo | number)[] = [];

    for (let i = 0; i <= text.length - ENCODING_LENGTH; i++) {
      let isEncodedKey = true;

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

  public containsEncodedKey(text: string): boolean {
    return INVISIBLE_CHARS.some((char) => text.includes(char));
  }

  /** Finds every encoded ID, including sequences interleaved with visible text. */
  public extractAllIds(text: string): number[] {
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

  public getMappings(): Record<string, number> {
    const mappings: Record<string, number> = {};
    this.keyToIdMap.forEach((id, key) => {
      mappings[key] = id;
    });
    return mappings;
  }

  public reset(): void {
    this.keyToIdMap.clear();
    this.idToKeyMap.clear();
    this.nextId = 1;
  }

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
