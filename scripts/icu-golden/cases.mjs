// The golden ICU message table for @comvi/core's compiler (lot 1a).
//
// Every case is rendered by the REFERENCE implementation, never by hand:
//   - `gen-icu4c.mjs` renders each case with ICU4C (MessageFormat, ApostropheMode
//     DOUBLE_OPTIONAL — ICU's default) and writes packages/core/tests/golden/icu4c.json;
//   - `gen-formatjs.mjs` renders the subset formatjs agrees on with
//     intl-messageformat and writes packages/core/tests/golden/formatjs.json.
// The core tests compare the compiler's output with those fixtures; they never
// regenerate them. Regenerate after editing this file (see README.md here).
//
// Scope = the grammar @comvi/core 0.8 implements (design rev 3, R3-8/R3-9):
// literal text with ICU apostrophe quoting, `{x}`, `plural`, `selectordinal`,
// `select`, `=N`, `offset:`, `#`. No `{x, number|date|time}` arguments.
//
// An argument value is a number or a string.
// A case with `error: true` must FAIL in the reference too (ICU4C reports a
// U_* parse error); core renders such a message as its key and reports
// `syntax`.

/** [pattern, locales, argument sets] */
export const CASES = [
  // --- plural: categories, `#` formatted for the locale (grouping, decimals, digits)
  [
    "{n, plural, one {# item} other {# items}}",
    ["en", "de", "uk", "ar-EG", "ja"],
    [0, 1, 2, 5, 21, 22, 1234, 1234.5, 1234567, -3, 0.5, 1.5, 101].map((n) => ({ n })),
  ],
  [
    "{n, plural, one {# день} few {# дні} many {# днів} other {# дня}}",
    ["uk"],
    [0, 1, 2, 4, 5, 11, 21, 22, 25, 111, 1.5].map((n) => ({ n })),
  ],
  [
    "{n, plural, zero {zero #} one {one #} two {two #} few {few #} many {many #} other {other #}}",
    ["ar-EG", "ar"],
    [0, 1, 2, 3, 11, 100, 102, 1234].map((n) => ({ n })),
  ],
  // `#` under non-Latin numbering systems (the integer fast path must not print ASCII
  // digits there); the plain `{n}` beside it prints String(n) (R3-17)
  [
    "{n, plural, other {# / {n}}}",
    ["ar-EG", "fa", "bn", "th-u-nu-thai", "hi-u-nu-deva", "en", "de"],
    [5, 109, 1234, 0.25].map((n) => ({ n })),
  ],
  // --- exact selectors, matched against the value before `offset:`
  [
    "{n, plural, =0 {none} =1 {exactly one} one {# one} other {# other}}",
    ["en", "uk"],
    [0, 1, 2, 21].map((n) => ({ n })),
  ],
  ["{n, plural, =1.5 {one and a half} other {#}}", ["en"], [1.5, 2].map((n) => ({ n }))],
  ["{n, plural, =-1 {minus one} other {#}}", ["en"], [-1, 1].map((n) => ({ n }))],
  // --- offset:
  [
    "{n, plural, offset:1 =0 {nobody} =1 {only {who}} one {{who} and # other} other {{who} and # others}}",
    ["en", "de", "uk"],
    [0, 1, 2, 3, 6, 23].map((n) => ({ n, who: "Ann" })),
  ],
  [
    "{n, plural, offset:1 =0 {nobody} one {you} other {you and # others}}",
    ["en"],
    [0, 1, 2, 3].map((n) => ({ n })),
  ],
  ["{n, plural, offset: 2 other {# more}}", ["en"], [2, 5, 1004].map((n) => ({ n }))],
  // --- selectordinal
  [
    "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    ["en"],
    [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 103, 111, 1001].map((n) => ({ n })),
  ],
  ["{n, selectordinal, other {#.}}", ["de", "uk"], [1, 2, 1234].map((n) => ({ n }))],
  [
    "{n, selectordinal, offset:1 one {#st} two {#nd} few {#rd} other {#th}}",
    ["en"],
    [2, 3, 4].map((n) => ({ n })),
  ],
  // --- select
  [
    "{g, select, female {She} male {He} other {They}}",
    ["en"],
    ["female", "male", "x", ""].map((g) => ({ g })),
  ],
  ["{g, select, female {# literal outside plural} other {x}}", ["en"], [{ g: "female", n: 5 }]],
  // --- nesting; `#` belongs to the IMMEDIATE plural sub-message only (R3-9)
  [
    "{n, plural, other {{g, select, female {she has # items} other {they have # items}}}}",
    ["en", "de"],
    [
      { n: 1234, g: "female" },
      { n: 1, g: "x" },
    ],
  ],
  [
    "{g, select, female {{n, plural, one {She has # item} other {She has # items}}} other {{n, plural, =0 {They have none} one {They have # item} other {They have # items}}}}",
    ["en", "de"],
    [
      { g: "female", n: 1 },
      { g: "female", n: 3 },
      { g: "x", n: 0 },
      { g: "x", n: 2000 },
    ],
  ],
  [
    "{a, plural, other {{b, select, x {{c, plural, one {# c} other {# cs}}} other {#}}}}",
    ["en"],
    [
      { a: 7, b: "x", c: 1 },
      { a: 7, b: "x", c: 4 },
      { a: 7, b: "y", c: 1 },
    ],
  ],
  [
    "{a, plural, one {A# {b, plural, one {B#} other {Bs#}} A#} other {As# {b, plural, one {B#} other {Bs#}} As#}}",
    ["en"],
    [
      { a: 1, b: 2 },
      { a: 3, b: 1 },
    ],
  ],
  // --- plain `{x}`: String(value), never Intl (owner decision R3-17, 28.10.2026). ICU4C
  // formats a number here; gen-icu4c.mjs sends it String(value) instead and marks the row
  // `plain`. A Date prints String(date), which depends on the process time zone, so no
  // Date row: packages/core/tests/compile/params.test.ts covers it.
  [
    "{x}",
    ["en", "de", "uk", "ar-EG", "ja"],
    [1234567, 1234.5678, -5, 0.5, 42, "text"].map((x) => ({ x })),
  ],
  ["Hello, {name}! You have {count} messages.", ["en", "de"], [{ name: "Ann", count: 1200 }]],
  ["{0} and {1}", ["en"], [{ 0: "a", 1: "b" }]],
  ["{ name } and { n }", ["en"], [{ name: "x", n: 3 }]],
  // --- apostrophe quoting (DOUBLE_OPTIONAL)
  ["It''s fine", ["en"], [{}]],
  ["I'm here", ["en"], [{}]],
  ["'{literal}' {x}", ["en"], [{ x: 1 }]],
  ["'{'", ["en"], [{}]],
  ["'}'", ["en"], [{}]],
  ["a '' b", ["en"], [{}]],
  ["'{a''b}'", ["en"], [{}]],
  ["'{unterminated", ["en"], [{}]],
  ["top '#' and #", ["en"], [{}]],
  ["{n, plural, other {# '#' items}}", ["en"], [{ n: 3 }]],
  ["{n, plural, other {'{'#'}'}}", ["en"], [{ n: 3 }]],
  ["{n, plural, other {it''s #}}", ["en"], [{ n: 3 }]],
  ["{n, plural, other {{k, select, other {'#' of #}}}}", ["en"], [{ n: 3, k: "any" }]],
  ["{k, select, other {'#{x}' tail}}", ["en"], [{ k: "any", x: 7 }]],
  ["{k, select, sharp {'#'1} other {plain}}", ["en"], [{ k: "sharp" }]],
  ["{k, select, other {'{'x'}'}}", ["en"], [{ k: "a" }]],
  // --- whitespace
  ["{ n , plural , one {#} other {#s} }", ["en"], [1, 2].map((n) => ({ n }))],
  ["{n,plural,one{#}other{#s}}", ["en"], [1, 2].map((n) => ({ n }))],
  ["{g,select,a{A}other{O}}", ["en"], [{ g: "a" }, { g: "b" }]],
  // --- literal text ICU does not treat as syntax
  ["a } b", ["en"], [{}]],
  ["emoji 🎉 {n, plural, one {# 🍎} other {# 🍎🍎}}", ["en"], [1, 2].map((n) => ({ n }))],
  // --- repeated selectors: the FIRST one wins; exact values compare as numbers
  ["{n, plural, one {a} one {b} other {c}}", ["en"], [{ n: 1 }]],
  ["{n, plural, =1 {a} =1 {b} other {c}}", ["en"], [{ n: 1 }]],
  ["{n, plural, other {a} other {b}}", ["en"], [{ n: 1 }]],
  ["{g, select, a {x} a {y} other {z}}", ["en"], [{ g: "a" }]],
  ["{n, plural, =1.0 {a} =01 {b} other {c}}", ["en"], [{ n: 1 }, { n: 2 }]],
  ["{n, plural, offset:1.5 other {#}}", ["en"], [{ n: 3 }]],
  ["{n,  plural ,  offset:1  other {#}}", ["en"], [{ n: 3 }]],
  ["{n, plural, foo {x} other {z}}", ["en"], [{ n: 1 }]],
  ["{g, select, ж {x} other {z}}", ["en"], [{ g: "ж" }, { g: "a" }]],
  ["{n, plural, one {x} other {z}} }", ["en"], [{ n: 1 }]],
  // --- a negative offset, and exact selectors in other number spellings
  ["{n, plural, offset:-1 other {#}}", ["en"], [{ n: 3 }, { n: -1 }]],
  ["{n, plural, =1e3 {thousand} other {#}}", ["en"], [{ n: 1000 }, { n: 1 }]],
  [
    "{n, plural, =+1 {plus one} =.5 {half} =1e-1 {tenth} =-0 {zero} =2. {two} other {#}}",
    ["en"],
    [1, 0.5, 0.1, 0, 2, 3].map((n) => ({ n })),
  ],
  ["{n, plural, offset:+1 other {#}}", ["en"], [{ n: 3 }]],
  ["{n, plural, offset:.5 other {#}}", ["en"], [{ n: 3 }]],
  ["{n, plural, offset: -1.5 other {#}}", ["en"], [{ n: 3 }]],
  ["{n, plural, offset:1e1 other {#}}", ["en"], [{ n: 30 }]],
  // --- numeric strings as plural counts: converted with Number() (owner decision
  // 27.10.2026, as 0.7 did). ICU4C rejects a string argument, so a `coerce` case is
  // rendered by ICU4C from Number(string); the fixture keeps the string args and
  // marks the row `coerced`.
  [
    "{n, plural, one {# item} other {# items}}",
    ["en", "de", "ar-EG"],
    ["1", "5", " 2.5 ", "1234.5", "-3", "1e3"].map((n) => ({ n })),
    { coerce: true },
  ],
  [
    "{n, plural, offset:1 =0 {nobody} =1 {only you} other {you and # others}}",
    ["en"],
    ["0", "1", "3"].map((n) => ({ n })),
    { coerce: true },
  ],
  [
    "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    ["en"],
    ["1", "22", "13"].map((n) => ({ n })),
    { coerce: true },
  ],
  // --- white space between argument tokens is ICU Pattern_White_Space, not JS \s
  ["{n,\u0085plural,\u0085other {#}}", ["en"], [{ n: 3 }]],
  ["{n,\u200eplural,\u2028other\u200f{#}}", ["en"], [{ n: 3 }]],
  ["{n,\tplural,\nother\r{#}}", ["en"], [{ n: 3 }]],
  // --- errors: the reference rejects these too
  ["{g, select, a:b {x} other {z}}", ["en"], [{ g: "a" }], { error: true }],
  ["{n", ["en"], [{ n: 1 }], { error: true }],
  ["{n, plural, one {x}}", ["en"], [{ n: 1 }], { error: true }],
  ["{g, select, a {x}}", ["en"], [{ g: "a" }], { error: true }],
  ["{n, plural, one {x} other {y}", ["en"], [{ n: 1 }], { error: true }],
  ["{n, plural, one x other {y}}", ["en"], [{ n: 1 }], { error: true }],
  ["{n, plural, =abc {x} other {y}}", ["en"], [{ n: 1 }], { error: true }],
  ["{}", ["en"], [{}], { error: true }],
  ["{a b}", ["en"], [{}], { error: true }],
  ["{g, select, offset:1 other {x}}", ["en"], [{ g: "a" }], { error: true }],
  ["{k, select, other {'#'}}", ["en"], [{ k: "any" }], { error: true }],
  ["{n,\u00a0plural,\u00a0other {#}}", ["en"], [{ n: 3 }], { error: true }],
  ["{n, plural,\u3000other {#}}", ["en"], [{ n: 3 }], { error: true }],
  ["{n, plural, =0x1 {hex} other {#}}", ["en"], [{ n: 1 }], { error: true }],
  ["{n, plural, =\u221e {inf} other {#}}", ["en"], [{ n: 1 }], { error: true }],
  ["{n, plural, = 1 {x} other {#}}", ["en"], [{ n: 1 }], { error: true }],
  ["{n, plural, =1e {x} other {#}}", ["en"], [{ n: 1 }], { error: true }],
  ["{n, plural, offset :1 other {#}}", ["en"], [{ n: 3 }], { error: true }],
  ["{n, plural, offset:x other {#}}", ["en"], [{ n: 3 }], { error: true }],
  ["{n, plural, offset:1x other {#}}", ["en"], [{ n: 3 }], { error: true }],
  ["{n,\ufeffplural, other {#}}", ["en"], [{ n: 3 }], { error: true }],
];

/** Flattens CASES into one row per (pattern, locale, args). */
export function expand() {
  const rows = [];
  for (const [pattern, locales, argSets, opts = {}] of CASES)
    for (const locale of locales)
      for (const args of argSets)
        rows.push({ pattern, locale, args, error: !!opts.error, coerce: !!opts.coerce });
  return rows;
}
