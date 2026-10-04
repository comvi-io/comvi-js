/**
 * The one definition of a usable API base URL: it parses and speaks http or
 * https. `init`, the config loader and the API client all ask it, so a value
 * one of them accepts cannot be refused by another later.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
