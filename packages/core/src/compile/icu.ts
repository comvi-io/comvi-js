/**
 * ICU complex arguments: `plural`, `selectordinal` and `select`, with `=N` exact
 * selectors and `offset:` (design rev 3, R3-8). Called by the scanner right after
 * the comma of `{name,`.
 *
 * Semantics follow ICU4C 78 (golden table `tests/golden/icu4c.json`):
 * - an exact selector `=N` is matched against the value BEFORE the offset; the
 *   plural category against `value - offset`; `#` prints `value - offset`;
 * - every plural, selectordinal and select needs an `other` branch;
 * - `#` is the count only in the immediate sub-messages of a plural or
 *   selectordinal. A `select` nested in one keeps `#` literal (R3-9); development
 *   builds warn once per (key, locale), see `compile()`.
 *
 * `{x, number}`, `{x, date}`, `{x, time}` and every other argument type are not
 * part of the 1.0 grammar: a `syntax` error whose development message points to
 * formatting the value in code.
 */
import { pluralRules } from "./fmt";
import {
  fail,
  isSpace,
  message,
  missing,
  run,
  skipSpace,
  type Part,
  type PartFn,
  type Scan,
} from "./scanner";

declare const __DEV__: boolean;

const EXACT = /^=-?\d+(\.\d+)?$/;
const OFFSET = /offset:\s*(\d+(?:\.\d+)?)/y;

/** A number a plural can select on: a finite number, or a numeric string. */
const toCount = (v: unknown): number =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? +v : NaN;

export const argument = (P: Scan, name: string, under: boolean): PartFn => {
  const s = P.s;
  skipSpace(P);
  const start = P.i;
  let c: string | undefined;
  while ((c = s[P.i]) !== undefined && c !== "," && c !== "}" && c !== "{" && !isSpace(c)) P.i++;
  const type = s.slice(start, P.i);
  const select = type === "select";
  const ordinal = type === "selectordinal";
  if (!select && !ordinal && type !== "plural") {
    fail(
      __DEV__ &&
        (type === "number" || type === "date" || type === "time"
          ? `\`{${name}, ${type}}\` is not supported: format the value in code (useFormat()) and pass it as a plain {${name}}`
          : `unknown argument type \`${type}\` in \`{${name}, …}\`; supported: plural, selectordinal, select`),
    );
  }
  skipSpace(P);
  if (s[P.i++] !== ",") fail(__DEV__ && `\`{${name}, ${type}}\` has no choice list`);
  skipSpace(P);

  let offset = 0;
  let m: RegExpExecArray | null;
  if (!select && ((OFFSET.lastIndex = P.i), (m = OFFSET.exec(s)))) {
    offset = +m[1];
    P.i = OFFSET.lastIndex;
  }

  const branches: Record<string, readonly Part[]> = Object.create(null);
  for (;;) {
    skipSpace(P);
    c = s[P.i];
    if (c === "}") break;
    if (c === undefined) fail(__DEV__ && `\`{${name}, ${type}, …}\` is never closed`);
    const keyStart = P.i;
    while ((c = s[P.i]) !== undefined && c !== "{" && c !== "}" && !isSpace(c)) P.i++;
    let key = s.slice(keyStart, P.i);
    if (key[0] === "=" && !select && EXACT.test(key)) key = "=" + Number(key.slice(1));
    else if (!key || /[=:'#{}<,]/.test(key))
      fail(__DEV__ && `invalid selector \`${key}\` in \`{${name}, ${type}, …}\``);
    skipSpace(P);
    if (s[P.i++] !== "{")
      fail(__DEV__ && `selector \`${key}\` in \`{${name}, ${type}, …}\` has no {sub-message}`);
    // `#` is the count in a plural's own sub-messages only; a select passes `false`.
    // A repeated selector keeps its FIRST sub-message, as ICU4C does.
    const sub = message(P, !select, under || !select, true);
    branches[key] ??= sub;
    if (s[P.i++] !== "}")
      fail(__DEV__ && `a sub-message of \`{${name}, ${type}, …}\` is never closed`);
  }
  P.i++;
  const other = branches.other;
  if (!other) fail(__DEV__ && `\`{${name}, ${type}, …}\` needs an \`other\` branch`);

  if (select) {
    return (p, l, x, h) => {
      const v = p[name];
      if (v == null)
        missing(
          P,
          x,
          l,
          name,
          __DEV__ && `no value for {${name}, select}; rendering its \`other\` branch`,
        );
      return run((v != null && branches[String(v)]) || other, p, l, x, h);
    };
  }

  return (p, l, x) => {
    const n = toCount(p[name]);
    if (n !== n)
      return missing(
        P,
        x,
        l,
        name,
        __DEV__ && `{${name}, ${type}} needs a number, got ${typeof p[name]}`,
      );
    const v = n - offset;
    return run(
      branches["=" + n] || branches[pluralRules(l, ordinal).select(v)] || other,
      p,
      l,
      x,
      v,
    );
  };
};
