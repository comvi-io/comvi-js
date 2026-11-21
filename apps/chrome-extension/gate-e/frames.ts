/**
 * An independent reader of the editor's self-contained translation markers (editor plan §3.2,
 * packages/editor/src/marker.ts): a frame is U+E007E, a payload written with the tag
 * characters U+E0020–U+E007D (mirroring ASCII 0x20–0x7D), then U+E007F. The payload is
 * `inst|ns|key`, each component UTF-8 with `%XX` escapes; a closing frame of a rich pair
 * starts with `/`. Written apart from the editor on purpose: the gate checks the format, not
 * the editor's own decoder.
 */
const FRAME = /\u{E007E}([\u{E0020}-\u{E007D}]*)\u{E007F}/gu;

export interface DecodedFrame {
  inst: string;
  ns: string;
  key: string;
  close: boolean;
}

export function decodeFrames(text: string): DecodedFrame[] {
  const frames: DecodedFrame[] = [];
  for (const [, tags] of text.matchAll(FRAME)) {
    const payload = [...tags!]
      .map((c) => String.fromCharCode(c.codePointAt(0)! - 0xe0000))
      .join("");
    const close = payload.startsWith("/");
    const parts = (close ? payload.slice(1) : payload).split("|");
    if (parts.length !== 3) continue;
    const [inst, ns, key] = parts.map((part) => decodeURIComponent(part));
    frames.push({ inst: inst!, ns: ns!, key: key!, close });
  }
  return frames;
}

export const stripFrames = (text: string): string => text.replace(FRAME, "");
