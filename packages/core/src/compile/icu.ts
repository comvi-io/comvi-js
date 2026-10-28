/**
 * ICU complex arguments: `plural`, `selectordinal` and `select`, with `=N` exact
 * selectors and `offset:` (design rev 3, R3-8). Called by the scanner right after
 * the comma of `{name,`.
 *
 * Semantics follow ICU4C 78 (golden table `tests/golden/icu4c.json`):
 * - an exact selector `=N` is matched against the value BEFORE the offset; the
 *   plural category against `value - offset`; `#` prints `value - offset`;
 * - every plural, selectordinal and select needs an `other` branch;
 * - a plural count is a number; a numeric string is converted with Number() (0.7
 *   behaviour kept by the owner, 27.10.2026), where ICU4C rejects any string;
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
  arg,
  fail,
  message,
  missing,
  run,
  skipSpace,
  token,
  type Part,
  type PartFn,
  type Scan,
} from "./scanner";

declare const __DEV__: boolean;

/*
 * ICU's number syntax for `=N` and `offset:` (ICU4C 78 MessagePattern; golden table):
 * sign, digits with an optional fraction (`1.`, `.5`), optional exponent; after
 * `offset:`, ICU Pattern_White_Space (scanner.ts `isSpace`).
 */
const EXACT = /^=[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const OFFSET =
  /offset:[\t-\r \x85\u200e\u200f\u2028\u2029]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;

export const argument = (P: Scan, name: string, under: boolean): PartFn => {
  const s = P.s;
  let c: string | undefined;
  const type = token(P);
  if (__DEV__ && P.o) P.o(1, name, type);
  const select = type === "select";
  const ordinal = type === "selectordinal";
  if (!select && !ordinal && type !== "plural") {
    fail(
      // The useFormat() hint ships in production too: the owner's 1.0 contract reports it
      // through onError({ code: "syntax" }) in every build (R3-8).
      type === "number" || type === "date" || type === "time"
        ? __DEV__
          ? `{${name}, ${type}} is not supported: format it in code with useFormat() and pass a plain {${name}}`
          : "format it in code with useFormat()"
        : __DEV__
          ? `unknown argument type \`${type}\` in \`{${name}, …}\`; supported: plural, selectordinal, select`
          : undefined,
    );
  }
  if (s[P.i++] !== ",") {
    if (__DEV__) fail(`\`{${name}, ${type}}\` has no choice list`);
    fail();
  }
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
    if (!c) {
      if (__DEV__) fail(`\`{${name}, ${type}, …}\` is never closed`);
      fail();
    }
    let key = token(P);
    if (key[0] === "=" && !select && EXACT.test(key)) key = "=" + Number(key.slice(1));
    else if (!key || /[=:'#<]/.test(key)) {
      if (__DEV__) fail(`invalid selector \`${key}\` in \`{${name}, ${type}, …}\``);
      fail();
    }
    if (__DEV__ && P.o) P.o(2, key);
    if (s[P.i++] !== "{") {
      if (__DEV__) fail(`selector \`${key}\` in \`{${name}, ${type}, …}\` has no {sub-message}`);
      fail();
    }
    // `#` is the count in a plural's own sub-messages only; a select passes `false`.
    // A repeated selector keeps its FIRST sub-message, as ICU4C does.
    // `under` only feeds a development warning: production passes `false`.
    const sub = message(P, !select, __DEV__ && (under || !select), true);
    branches[key] ??= sub;
    if (s[P.i++] !== "}") {
      if (__DEV__) fail(`a sub-message of \`{${name}, ${type}, …}\` is never closed`);
      fail();
    }
  }
  P.i++;
  if (__DEV__ && P.o) P.o(3, name);
  const other = branches.other;
  if (!other) {
    if (__DEV__) fail(`\`{${name}, ${type}, …}\` needs an \`other\` branch`);
    fail();
  }

  if (select) {
    return (p, l, x, h) => {
      const v = arg(p, name);
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

  // The plural rules of the last locale this message rendered in: one lookup per locale
  // change instead of one cache-key string per render.
  let rules: Intl.PluralRules | undefined;
  let rl: string | undefined;
  return (p, l, x) => {
    // A plural selects on a number. A numeric string (`"5"`, `" 2.5 "`) is converted with
    // Number(), as 0.7 did (owner decision 27.10.2026; ICU4C itself rejects strings). A
    // blank or non-numeric string, NaN, a missing value or any other type renders `{n}`.
    const v = arg(p, name);
    const n = typeof v === "string" && v.trim() ? +v : v;
    if (typeof n !== "number" || n !== n)
      return missing(
        P,
        x,
        l,
        name,
        __DEV__ &&
          `{${name}, ${type}} needs a number or a numeric string, got ${typeof v === "string" ? JSON.stringify(v) : typeof v}`,
      );
    const c = n - offset;
    return run(
      branches["=" + n] ||
        branches[(rl === l ? rules! : ((rl = l), (rules = pluralRules(l, ordinal)))).select(c)] ||
        other,
      p,
      l,
      x,
      c,
    );
  };
};
