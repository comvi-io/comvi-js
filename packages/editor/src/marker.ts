/**
 * The marker format (editor plan §3.2): a frame `U+E007E` · payload · `U+E007F`, where the
 * payload is `inst "|" ns "|" key` written only with the tag characters `U+E0020–U+E007D`,
 * which mirror ASCII `0x20–0x7D`. Each component is its UTF-8 bytes: `0x21–0x7D` except `|`
 * and `%` as they are, every other byte as `%XX` (upper case). A closing frame of a rich
 * pair carries the same payload behind a leading `/`; an opening frame never starts with
 * `/` (a leading `/` of `inst` is written `%2F`).
 *
 * Self-contained translation markers: a frame decodes on its own, with no id table of
 * translations, so any session decodes any frame. ZWSP, ZWNJ and ZWJ are not part of the
 * alphabet, so text next to a frame never changes what it decodes to.
 */

const START = 0xe007e;
const END = 0xe007f;
const TAG = 0xe0000;
/** The payload alphabet: tag characters mirroring ASCII 0x20–0x7D. */
const LOW = 0xe0020;
const HIGH = 0xe007d;

/** The start character, for a cheap "may hold a frame" test. */
export const FRAME_START = String.fromCodePoint(START);

/** One decoded frame of a scanned string. */
export interface Frame {
  inst: string;
  ns: string;
  key: string;
  /** A closing frame of a rich pair (payload behind `/`). */
  close: boolean;
  /** UTF-16 offset of the start character. */
  start: number;
  /** UTF-16 offset just past the end character. */
  end: number;
}

const HEX = "0123456789ABCDEF";
const utf8 = new TextEncoder();

function component(value: string, first: boolean): string {
  let out = "";
  for (const byte of utf8.encode(value)) {
    const raw =
      byte >= 0x21 &&
      byte <= 0x7d &&
      byte !== 0x7c && // |
      byte !== 0x25 && // %
      !(first && out === "" && byte === 0x2f); // a leading `/` of the payload
    out += raw ? String.fromCharCode(byte) : "%" + HEX[byte >> 4] + HEX[byte & 15];
  }
  return out;
}

/** The frame of (inst, ns, key); `close` gives the closing frame of a rich pair. */
export function encodeFrame(inst: string, ns: string, key: string, close = false): string {
  const payload =
    (close ? "/" : "") +
    [component(inst, true), component(ns, false), component(key, false)].join("|");
  let out = FRAME_START;
  for (let i = 0; i < payload.length; i++) {
    out += String.fromCodePoint(TAG + payload.charCodeAt(i));
  }
  return out + String.fromCodePoint(END);
}

// `ignoreBOM`: a component that starts with U+FEFF keeps it (a key or namespace is text, not a stream).
const utf8Strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** One `%`-encoded component, or null when it is not one. */
function decodeComponent(text: string): string | null {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x25) {
      // `indexOf("")` is 0: a `%` too close to the end must not read as `%0`.
      if (i + 2 >= text.length) return null;
      const hi = HEX.indexOf(text[i + 1]!);
      const lo = HEX.indexOf(text[i + 2]!);
      if (hi < 0 || lo < 0) return null;
      bytes.push(hi * 16 + lo);
      i += 2;
    } else if (c >= 0x21 && c <= 0x7d && c !== 0x7c) {
      bytes.push(c);
    } else {
      return null;
    }
  }
  try {
    return utf8Strict.decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function parsePayload(payload: string, start: number, end: number): Frame | null {
  const close = payload.startsWith("/");
  const parts = (close ? payload.slice(1) : payload).split("|");
  if (parts.length !== 3) return null;
  const [inst, ns, key] = parts.map(decodeComponent);
  if (inst == null || ns == null || key == null) return null;
  return { inst, ns, key, close, start, end };
}

/**
 * Every valid frame of `text`, in order. A start character before an end restarts the frame;
 * a character outside the payload alphabet, a missing end, a payload without exactly three
 * components or a bad `%XX` drops it.
 */
export function decodeFrames(text: string): Frame[] {
  const frames: Frame[] = [];
  let open = -1;
  let payload = "";
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i)!;
    const next = i + (cp > 0xffff ? 2 : 1);
    if (cp === START) {
      open = i;
      payload = "";
    } else if (open >= 0) {
      if (cp === END) {
        const frame = parsePayload(payload, open, next);
        if (frame) frames.push(frame);
        open = -1;
      } else if (cp >= LOW && cp <= HIGH) {
        payload += String.fromCharCode(cp - TAG);
      } else {
        open = -1;
      }
    }
    i = next;
  }
  return frames;
}

/** `text` without its valid frames — every other character, ZWSP/ZWNJ/ZWJ included, stays. */
export function stripFrames(text: string, frames = decodeFrames(text)): string {
  let out = "";
  let from = 0;
  for (const frame of frames) {
    out += text.slice(from, frame.start);
    from = frame.end;
  }
  return out + text.slice(from);
}
