/**
 * Frames as `t()` output carries them under an editor session (`src/marker.ts`), for suites
 * that build marked text by hand. `inst` defaults to empty: the page's only instance.
 */
import { encodeFrame } from "../../src/marker";

export interface KeyRef {
  key: string;
  ns: string;
  inst: string;
}

export const keyRef = (key: string, ns = "default", inst = ""): KeyRef => ({ key, ns, inst });

/** The suffix frame of `ref` (or of key `ref` in `ns`). */
export function marker(ref: KeyRef | string, ns = "default", inst = ""): string {
  const r = typeof ref === "string" ? keyRef(ref, ns, inst) : ref;
  return encodeFrame(r.inst, r.ns, r.key);
}

/** A frame start and end around a payload with two components: never decodes. */
export const BROKEN_FRAME = (() => {
  const frame = encodeFrame("", "ns", "key");
  // Drop the second "|" (U+E007C) so the payload has two components.
  const bar = String.fromCodePoint(0xe007c);
  const last = frame.lastIndexOf(bar);
  return frame.slice(0, last) + frame.slice(last + bar.length);
})();
