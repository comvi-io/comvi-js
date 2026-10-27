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
import { formatNumber, formatValue } from "./fmt";
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

/**
 * A compiled part: literal text, or a function that yields text or a FRAME — an array of
 * rendered values that the parent spreads (a non-string value travels as `[value]`).
 */
export type Part = string | PartFn;
export type PartFn = (p: Params, l: string, x: Env | undefined, h: number) => string | unknown[];

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
export const SYNTAX: {
  /** The message of the last failure (development, plus the one hint that ships). */
  m?: string;
} = {};

/**
 * Ends the scan. Call sites write `if (__DEV__) fail(explanation); fail();` so that
 * production calls `fail()` with no argument; only the useFormat() hint (icu.ts) ships.
 */
export const fail = (message?: string): never => {
  SYNTAX.m = message;
  throw SYNTAX;
};

export const report = (x: Env | undefined, error: I18nError): void =>
  (x?.r || defaultOnError)(error);

/** Reports `missing_param` for `name` and returns what renders in its place: `{name}`. */
export const missing = (
  P: Scan,
  x: Env | undefined,
  locale: string,
  name: string,
  message: string | false,
): string => {
  const e: I18nError = { code: "missing_param", key: P.k, locale, param: name };
  if (__DEV__ && message) e.message = message;
  report(x, e);
  return "{" + name + "}";
};

/**
 * ICU Pattern_White_Space, the only white space ICU allows between argument tokens:
 * TAB…CR, SPACE, NEL, LRM, RLM, LINE and PARAGRAPH SEPARATOR. Not JS `\s` — that adds
 * NBSP, U+3000, U+FEFF and others ICU4C rejects (golden table). Regex LITERALS only at
 * module level here and in icu.ts: a `new RegExp()` is a call the bundler must keep,
 * which drags this module into graphs that never compile a message.
 */
const SPACE = /[\t-\r \x85\u200e\u200f\u2028\u2029]/;
export const isSpace = (c: string | undefined): boolean => SPACE.test(c as string); // `undefined` tests as "undefined"

/** Skips spaces, reads one token (up to `,`, `{`, `}` or a space), skips spaces after it. */
export const token = (P: Scan): string => {
  skipSpace(P);
  const start = P.i;
  let c: string | undefined;
  while ((c = P.s[P.i]) && c !== "," && c !== "}" && c !== "{" && !isSpace(c)) P.i++;
  const t = P.s.slice(start, P.i);
  skipSpace(P);
  return t;
};

export const skipSpace = (P: Scan): void => {
  while (isSpace(P.s[P.i])) P.i++;
};

const own = Object.prototype.hasOwnProperty;

/**
 * The parameter `name`, read from the params object's OWN properties only: a catalog
 * string can name any identifier (`{constructor}`, `<toString>`), and nothing inherited
 * from Object.prototype may become a value or a tag handler.
 */
export const arg = (p: Params, name: string): unknown => (own.call(p, name) ? p[name] : undefined);

/** A rendered value as a part result: text as is, anything else as a one-value frame. */
const frame = (v: unknown): string | unknown[] => (typeof v === "string" ? v : [v]);

const TAG = /<(\/?)([A-Za-z][\w-]*)\s*(\/?)>/y;

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
      for (const e of v) {
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
  while ((c = s[P.i])) {
    if (c === "'") {
      c = s[++P.i];
      if (c === "'") {
        buf += c;
        P.i++;
      } else if (c === "{" || c === "}" || c === "<" || (hash && c === "#")) {
        // Quoted literal: up to the next lone apostrophe; `''` inside is one apostrophe.
        for (; (c = s[P.i]); P.i++) {
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
      const name = token(P);
      c = s[P.i];
      if (!name || (c !== "}" && c !== ",")) {
        if (__DEV__) fail(!c ? "unclosed `{`" : `invalid argument \`{${name} ${c}\``);
        fail();
      }
      flush();
      if (c === "}") {
        P.i++;
        parts.push((p, l, x) => {
          const v = arg(p, name);
          // `formatValue` yields `undefined` for a value that cannot print (an invalid Date).
          const f = v == null ? v : formatValue(v, l, x?.z);
          return f === undefined || f === null
            ? missing(P, x, l, name, __DEV__ && `no value for {${name}}`)
            : frame(f);
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
        if (m[3] || name !== tag) {
          if (__DEV__) fail(`\`</${name}>\` closes no open tag`);
          fail();
        }
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
    if (__DEV__) fail(`\`<${tag}>\` is never closed`);
    fail();
  }
  flush();
  return parts;
};

/** `#`: the count of the nearest plural, minus its offset, formatted for the locale. */
const hashPart: PartFn = (_p, l, _x, h) => formatNumber(h, l);

/** A rich-text tag: the parameter of the same name renders the children. */
const tagPart =
  (key: string | undefined, name: string, kids: readonly Part[]): PartFn =>
  (p, l, x, h) => {
    const children = run(kids, p, l, x, h);
    const handler = arg(p, name);
    if (typeof handler === "function") {
      return frame(handler(typeof children === "string" ? (children ? [children] : []) : children));
    }
    if (__DEV__) {
      devWarn(
        "tag\0" + key + "\0" + name,
        `<${name}> in "${key}" has no handler; its children render as plain text`,
      );
    }
    return children;
  };
