/**
 * The message scanner: ICU MessageFormat text with apostrophe quoting, plain `{x}`
 * arguments, `#`, and rich-text tags — compiled once into a list of parts.
 *
 * Grammar (the reference is ICU4C 78 MessageFormat, ApostropheMode
 * DOUBLE_OPTIONAL; golden table `tests/golden/icu4c.json`):
 *
 * - `''` is one apostrophe, everywhere.
 * - `'` starts a quoted literal only before `{`, `}`, `<`, or — inside the
 *   IMMEDIATE sub-message of a plural/selectordinal — `#`. The literal runs to the
 *   next lone `'` (or the end of the text; an unterminated quote is not an error).
 *   Any other `'` is literal.
 * - `{name}` prints a parameter (formatted for the locale, see fmt.ts);
 *   `{name, plural|selectordinal|select, …}` is handled by icu.ts. Every other
 *   argument type (`number`, `date`, `time`, …) is a `syntax` error.
 * - `#` is the plural count only in the immediate sub-message of a plural or
 *   selectordinal; anywhere else — top level, or a `select` nested in a plural —
 *   it is a literal `#`, as in ICU4C (R3-9).
 * - `}` outside any argument is literal text (ICU4C accepts it).
 * - `<tag>…</tag>` and `<tag/>` are rich-text tags, always on (R3-11). A tag name
 *   starts with a letter; anything else after `<` is literal text. The handler is
 *   the parameter of the same name; without one, the children render inline.
 *
 * A syntax error never throws out of `compile()` (cache.ts): the message renders
 * as its key and reports `syntax` through the render environment, identically in
 * development and production.
 */
import { devWarn, defaultOnError, type I18nError, type OnError } from "../errors";
import { formatValue } from "./fmt";
import { argument } from "./icu";

declare const __DEV__: boolean;

export type Params = Readonly<Record<string, unknown>>;

/**
 * Per-instance data a compiled message reads at render time — never at compile
 * time, so one compiled message is shared by every instance (R4-2).
 */
export interface Env {
  /** IANA time zone for Date values; the runtime default when absent. */
  z?: string;
  /** Error sink; `defaultOnError` when absent. */
  r?: OnError;
}

/** A compiled part: literal text, or a function that yields one value. */
export type Part = string | PartFn;
export type PartFn = (p: Params, l: string, x: Env | undefined, h: number) => unknown;

/** Scanner state over one template. */
export interface Scan {
  /** The template. */
  s: string;
  /** Read position. */
  i: number;
  /** The catalog key, for reports. */
  k: string | undefined;
  /** Development: a `#` was left literal inside a select nested in a plural. */
  w?: boolean;
}

/** Thrown inside the scanner, caught by `compile()`; never escapes to callers. */
export interface SyntaxFailure {
  syntax: string | undefined;
}

export const fail = (message?: string | false): never => {
  throw { syntax: (__DEV__ && message) || undefined } satisfies SyntaxFailure;
};

export const report = (x: Env | undefined, error: I18nError): void =>
  ((x && x.r) || defaultOnError)(error);

/** Reports `missing_param` for `name` and returns what renders in its place: `{name}`. */
export const missing = (
  P: Scan,
  x: Env | undefined,
  locale: string,
  name: string,
  message: string | false,
): string => {
  report(x, { code: "missing_param", key: P.k, locale, message: message || undefined });
  return "{" + name + "}";
};

/** Pattern_White_Space as ICU uses it between argument tokens. */
export const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);

export const skipSpace = (P: Scan): void => {
  while (isSpace(P.s[P.i])) P.i++;
};

const TAG = /<(\/?)([A-Za-z][\w-]*)\s*(\/?)>/y;

/** Internal multi-part results, spread into their parent instead of nested. */
const frames = new WeakSet<object>();

/**
 * Renders parts. Returns a string when every value is a string; otherwise an array of
 * the values with adjacent strings merged (rich text). Literal parts and formatted
 * values are concatenated without an intermediate array on the string path.
 */
export const run = (
  parts: readonly Part[],
  p: Params,
  l: string,
  x: Env | undefined,
  h: number,
): string | unknown[] => {
  let s = "";
  let out: unknown[] | undefined;
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    const v = typeof q === "string" ? q : q(p, l, x, h);
    if (typeof v === "string") s += v;
    else {
      out ??= [];
      for (const e of frames.has(v as object) ? (v as unknown[]) : [v]) {
        if (typeof e === "string") s += e;
        else {
          if (s) out.push(s);
          s = "";
          out.push(e);
        }
      }
    }
  }
  if (!out) return s;
  if (s) out.push(s);
  frames.add(out);
  return out;
};

/**
 * Scans one message (the top level, a sub-message, or a tag's children) into parts.
 *
 * @param hash  `#` is the count here (the immediate sub-message of a plural).
 * @param under Some ancestor is a plural (development diagnostics only).
 * @param tag   The open tag whose children this is; its closing tag ends the scan.
 * @param nested A sub-message: an unquoted `}` ends the scan.
 */
export const message = (
  P: Scan,
  hash: boolean,
  under: boolean,
  nested: boolean,
  tag?: string,
): Part[] => {
  const s = P.s;
  const parts: Part[] = [];
  let buf = "";
  let c: string | undefined;
  let m: RegExpExecArray | null;
  const flush = () => {
    if (buf) parts.push(buf);
    buf = "";
  };
  while ((c = s[P.i]) !== undefined) {
    if (c === "'") {
      c = s[++P.i];
      if (c === "'") {
        buf += c;
        P.i++;
      } else if (c === "{" || c === "}" || c === "<" || (hash && c === "#")) {
        // Quoted literal: up to the next lone apostrophe; `''` inside is one apostrophe.
        for (; (c = s[P.i]) !== undefined; P.i++) {
          if (c === "'") {
            if (s[P.i + 1] !== "'") {
              P.i++;
              break;
            }
            P.i++;
          }
          buf += c;
        }
      } else buf += "'";
    } else if (c === "{") {
      P.i++;
      skipSpace(P);
      const start = P.i;
      while ((c = s[P.i]) !== undefined && c !== "," && c !== "}" && c !== "{" && !isSpace(c))
        P.i++;
      const name = s.slice(start, P.i);
      skipSpace(P);
      c = s[P.i];
      if (!name || (c !== "}" && c !== ",")) {
        fail(
          __DEV__ &&
            (c === undefined ? "unclosed `{`" : `invalid argument \`{${s.slice(start, P.i + 1)}\``),
        );
      }
      flush();
      if (c === "}") {
        P.i++;
        parts.push((p, l, x) => {
          const v = p[name];
          if (v != null) return formatValue(v, l, x && x.z);
          return missing(P, x, l, name, __DEV__ && `no value for {${name}}`);
        });
      } else {
        P.i++;
        parts.push(argument(P, name, under));
      }
    } else if (c === "}") {
      if (nested) break;
      buf += c;
      P.i++;
    } else if (c === "#" && hash) {
      flush();
      parts.push(hashPart);
      P.i++;
    } else if (c === "<" && (m = ((TAG.lastIndex = P.i), TAG.exec(s)))) {
      const name = m[2];
      P.i += m[0].length;
      if (m[1]) {
        // A closing tag ends the children of the tag it names; nothing else may close.
        if (m[3] || name !== tag) fail(__DEV__ && `\`</${name}>\` closes no open tag`);
        flush();
        return parts;
      }
      flush();
      parts.push(tagPart(P.k, name, m[3] ? [] : message(P, hash, under, nested, name)));
    } else {
      if (__DEV__ && c === "#" && under) P.w = true;
      buf += c;
      P.i++;
    }
  }
  if (tag !== undefined) {
    // The loop ended without the closing tag: end of text or the `}` of a sub-message.
    fail(__DEV__ && `\`<${tag}>\` is never closed`);
  }
  flush();
  return parts;
};

/** `#`: the count of the nearest plural, minus its offset, formatted for the locale. */
const hashPart: PartFn = (_p, l, _x, h) => formatValue(h, l);

/** A rich-text tag: the parameter of the same name renders the children. */
const tagPart =
  (key: string | undefined, name: string, kids: readonly Part[]): PartFn =>
  (p, l, x, h) => {
    const children = run(kids, p, l, x, h);
    const handler = p[name];
    if (typeof handler === "function") {
      return handler(typeof children === "string" ? (children ? [children] : []) : children);
    }
    if (__DEV__) {
      devWarn(
        "tag\0" + key + "\0" + name,
        `<${name}> in "${key}" has no handler; its children render as plain text`,
      );
    }
    return children;
  };
