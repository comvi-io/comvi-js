import { describe, expect, it } from "vitest";
import { scanMessageShape, type MessageShape } from "../src/index";

/**
 * The full shape a row expects: every field not named is empty, and
 * `unsupported` is absent unless named. Compared with `toStrictEqual` on a
 * plain copy, so a shape that carries `unsupported: undefined` fails too.
 */
function shape(expected: Partial<MessageShape>): MessageShape {
  return {
    params: [],
    plurals: {},
    ordinals: {},
    selects: {},
    tags: [],
    unbalancedTags: [],
    ...expected,
  };
}

function scan(value: string): MessageShape {
  const result = scanMessageShape(value);
  return {
    ...result,
    plurals: { ...result.plurals },
    ordinals: { ...result.ordinals },
    selects: { ...result.selects },
  };
}

const str = (name: string) => ({ name, type: "string" as const });
const num = (name: string) => ({ name, type: "number" as const });

describe("scanMessageShape", () => {
  /**
   * Every message `@comvi/vite-plugin`'s extractor table pins, read as a whole
   * shape. The plugin keeps its own table; these rows also say what the shape
   * holds beyond the parameters.
   */
  describe("parameters, as the vite-plugin extractor reads them", () => {
    it.each([
      { value: "Hi {name}", expected: shape({ params: [str("name")] }) },
      {
        value: "{count, plural, one {# item} other {# items}}",
        expected: shape({ params: [num("count")], plurals: { count: ["one", "other"] } }),
      },
      {
        value: "{place, selectordinal, other {#th}}",
        expected: shape({
          params: [num("place")],
          ordinals: { place: ["other"] },
        }),
      },
      { value: "{total, number}", expected: shape({ unsupported: "number" }) },
      { value: "{total, number, percent}", expected: shape({ unsupported: "number" }) },
      { value: "{when, date, short}", expected: shape({ unsupported: "date" }) },
      { value: "{at, time}", expected: shape({ unsupported: "time" }) },
      { value: "{at, time, short}", expected: shape({ unsupported: "time" }) },
      { value: "{n, pluralx, other {a}}", expected: shape({ unsupported: "pluralx" }) },
      { value: "{count, plural}", expected: shape({ unsupported: "plural" }) },
      { value: "{count, plural, other}", expected: shape({ unsupported: "plural" }) },
      // The shape keeps what compiled; dropping it is the projection's call.
      {
        value: "Hi {name} and {total, number}",
        expected: shape({ params: [str("name")], unsupported: "number" }),
      },
      {
        value: "{gender, select, male {he} other {they}}",
        expected: shape({ params: [str("gender")], selects: { gender: ["male", "other"] } }),
      },
      { value: "{x, wobble, other {a}}", expected: shape({ unsupported: "wobble" }) },
      {
        value: "{count, plural, one {item} other {items}}",
        expected: shape({ params: [num("count")], plurals: { count: ["one", "other"] } }),
      },
      {
        value: "{count, plural, other {# of {total}}}",
        expected: shape({ params: [num("count"), str("total")], plurals: { count: ["other"] } }),
      },
      { value: "Hi {name }", expected: shape({ params: [str("name")] }) },
      { value: "a { b {name}", expected: shape({}) },
      {
        value: "{count, plural, other {#}} of {count}",
        expected: shape({ params: [num("count")], plurals: { count: ["other"] } }),
      },
      {
        value: "{count, plural, other {#}} {count, select, other {x}}",
        expected: shape({
          params: [num("count")],
          plurals: { count: ["other"] },
          selects: { count: ["other"] },
        }),
      },
      { value: "{name x}", expected: shape({ params: [str("name x")] }) },
      { value: "{ spaced }", expected: shape({ params: [str("spaced")] }) },
      { value: "{0} items", expected: shape({ params: [str("0")] }) },
      { value: "{name and {other}", expected: shape({}) },
      { value: "{a}{b}", expected: shape({ params: [str("a"), str("b")] }) },
      { value: "no parameters at all", expected: shape({}) },
      {
        value: "{count,plural,other{#}}",
        expected: shape({ params: [num("count")], plurals: { count: ["other"] } }),
      },
      {
        value: "{ count , plural , other {#} }",
        expected: shape({ params: [num("count")], plurals: { count: ["other"] } }),
      },
      { value: "{count, PLURAL, other {#}}", expected: shape({ unsupported: "PLURAL" }) },
      {
        value: "{count, plural, other {# and {inner, number}}}",
        expected: shape({
          params: [num("count")],
          plurals: { count: ["other"] },
          unsupported: "number",
        }),
      },
      { value: "{g, selection, other {a}}", expected: shape({ unsupported: "selection" }) },
      { value: "{count, select}", expected: shape({ unsupported: "select" }) },
      { value: "{count, plural, other {x} garbage}", expected: shape({ unsupported: "plural" }) },
      { value: "{count, select, male he}", expected: shape({ unsupported: "select" }) },
      {
        value: "{count, plural, }",
        expected: shape({ params: [num("count")], plurals: { count: [] } }),
      },
      {
        value: "{count, plural, 5 {x}}",
        expected: shape({ params: [num("count")], plurals: { count: ["5"] } }),
      },
    ])("$value", ({ value, expected }) => {
      expect(scan(value)).toStrictEqual(expected);
    });
  });

  /**
   * ICU DOUBLE_OPTIONAL quoting: an apostrophe opens quoted text only before
   * `{`, `}`, or `#` inside a plural sub-message, and `''` is one apostrophe.
   */
  describe("ICU apostrophe quoting", () => {
    it.each([
      { value: "'{name}' stays literal", expected: shape({}) },
      { value: "'{name}' but {real}", expected: shape({ params: [str("real")] }) },
      { value: "It''s {name}", expected: shape({ params: [str("name")] }) },
      { value: "''{name}''", expected: shape({ params: [str("name")] }) },
      { value: "Superiors' behavior for {name}", expected: shape({ params: [str("name")] }) },
      { value: "'}' closes nothing, {name} does", expected: shape({ params: [str("name")] }) },
      {
        value: "{count, plural, other {'{total}' items}}",
        expected: shape({ params: [num("count")], plurals: { count: ["other"] } }),
      },
      {
        value: "{count, plural, other {'#' of {total}}}",
        expected: shape({ params: [num("count"), str("total")], plurals: { count: ["other"] } }),
      },
      {
        value: "{count, plural, other {'}' {total}}}",
        expected: shape({ params: [num("count"), str("total")], plurals: { count: ["other"] } }),
      },
      {
        value: "{gender, select, male {'{x}'} other {they}}",
        expected: shape({ params: [str("gender")], selects: { gender: ["male", "other"] } }),
      },
      { value: "'#' {n}", expected: shape({ params: [str("n")] }) },
      { value: "'{name} and {other}", expected: shape({}) },
      // `'#` opens a quote inside a plural branch, so the placeholder after it
      // is quoted text — and nowhere else, so the same text at the top level
      // and in a select branch keeps its placeholder.
      {
        value: "{count, plural, other {'#{total}'}}",
        expected: shape({ params: [num("count")], plurals: { count: ["other"] } }),
      },
      { value: "'#{total}'", expected: shape({ params: [str("total")] }) },
      {
        value: "{g, select, a {'#{total}' x} other {y}}",
        expected: shape({ params: [str("g"), str("total")], selects: { g: ["a", "other"] } }),
      },
      // A select inside a plural branch inherits the plural's `#` rule.
      {
        value: "{n, plural, other {{g, select, a {'#{total}'} other {x}}}}",
        expected: shape({
          params: [num("n"), str("g")],
          plurals: { n: ["other"] },
          selects: { g: ["a", "other"] },
        }),
      },
      // `''` inside a quoted section is an apostrophe, not its end.
      { value: "'{it''s}' {name}", expected: shape({ params: [str("name")] }) },
      // A quoted section that never ends runs to the end of the message.
      { value: "'{x} {name}", expected: shape({}) },
      // A quoted brace inside a choice list does not close the argument.
      {
        value: "{g, select, a {'}'} other {{name}}}",
        expected: shape({ params: [str("g"), str("name")], selects: { g: ["a", "other"] } }),
      },
      // A quoted comma does not split the argument.
      { value: "{a'{,'b}", expected: shape({ params: [str("a'{,'b")] }) },
    ])("$value", ({ value, expected }) => {
      expect(scan(value)).toStrictEqual(expected);
    });
  });

  describe("selectors", () => {
    it.each([
      {
        form: "explicit values as written",
        value: "{n, plural, =0 {none} one {one} other {many}}",
        expected: shape({ params: [num("n")], plurals: { n: ["=0", "one", "other"] } }),
      },
      {
        // Core matches `"=" + count`, so it rewrites each explicit value to
        // the spelling of its number and the last of two equal ones wins.
        form: "explicit values in the spelling of their number, each once",
        value: "{n, plural, =01 {a} =1.0 {b} =-0 {c} =2.50 {d} other {e}}",
        expected: shape({ params: [num("n")], plurals: { n: ["=1", "=0", "=2.5", "other"] } }),
      },
      {
        form: "an ordinal's explicit values the same way",
        value: "{p, selectordinal, =03 {a} other {b}}",
        expected: shape({ params: [num("p")], ordinals: { p: ["=3", "other"] } }),
      },
      {
        form: "a select's selectors as written, = and all",
        value: "{g, select, =01 {a} other {b}}",
        expected: shape({ params: [str("g")], selects: { g: ["=01", "other"] } }),
      },
      {
        form: "a selector that only ends in a number as written",
        value: "{n, plural, x5 {a} other {b}}",
        expected: shape({ params: [num("n")], plurals: { n: ["x5", "other"] } }),
      },
      {
        form: "an explicit value that is no number as written",
        value: "{n, plural, =x {a} other {b}}",
        expected: shape({ params: [num("n")], plurals: { n: ["=x", "other"] } }),
      },
      {
        form: "the union of every use of one argument, each selector once",
        value: "{n, plural, one {a} other {b}} {n, plural, =0 {z} other {c}}",
        expected: shape({ params: [num("n")], plurals: { n: ["one", "other", "=0"] } }),
      },
      {
        form: "a repeated selector once",
        value: "{g, select, a {x} a {y} other {z}}",
        expected: shape({ params: [str("g")], selects: { g: ["a", "other"] } }),
      },
      {
        form: "a selector touching its brace",
        value: "{n, plural,one{a}  other {b}}",
        expected: shape({ params: [num("n")], plurals: { n: ["one", "other"] } }),
      },
      {
        form: "selectors separated by a newline and a tab",
        value: "{n, plural,\none {a}\tother {b}}",
        expected: shape({ params: [num("n")], plurals: { n: ["one", "other"] } }),
      },
      {
        form: "an ordinal once, however often it is used",
        value: "{p, selectordinal, one {#st} other {#th}} {p, selectordinal, other {#}}",
        expected: shape({
          params: [num("p")],
          ordinals: { p: ["one", "other"] },
        }),
      },
      {
        form: "cardinal and ordinal selectors apart",
        value: "{a, selectordinal, other {#}} {b, plural, other {#}}",
        expected: shape({
          params: [num("a"), num("b")],
          plurals: { b: ["other"] },
          ordinals: { a: ["other"] },
        }),
      },
      {
        form: "a plural nested in a select",
        value:
          "{g, select, male {{n, plural, one {his #} other {his # items}}} other {{n, plural, other {their #}}}}",
        expected: shape({
          params: [str("g"), num("n")],
          plurals: { n: ["one", "other"] },
          selects: { g: ["male", "other"] },
        }),
      },
      {
        form: "a select nested in a plural",
        value: "{n, plural, other {{g, select, f {she} other {they}} has #}}",
        expected: shape({
          params: [num("n"), str("g")],
          plurals: { n: ["other"] },
          selects: { g: ["f", "other"] },
        }),
      },
      {
        form: "an argument named after an Object member as data",
        value: "{__proto__, plural, other {#}} {toString, select, a {x} other {y}}",
        expected: shape({
          params: [num("__proto__"), str("toString")],
          plurals: { ["__proto__"]: ["other"] },
          selects: { toString: ["a", "other"] },
        }),
      },
    ])("records $form", ({ value, expected }) => {
      expect(scan(value)).toStrictEqual(expected);
    });

    it("keeps argument names in null-prototype records", () => {
      const result = scanMessageShape(
        "{n, plural, other {#}} {p, selectordinal, other {#}} {g, select, a {x} other {y}}",
      );

      expect(Object.getPrototypeOf(result.plurals)).toBeNull();
      expect(Object.getPrototypeOf(result.ordinals)).toBeNull();
      expect(Object.getPrototypeOf(result.selects)).toBeNull();
    });
  });

  /**
   * Where a group ends and whether `'#` quotes inside it, read the way core's
   * `findMatchingBraceEnd` and `isPluralArgStart` read it. Every expectation
   * here was checked against `@comvi/core` with `icuCompiler`: the parameter a
   * row names is the one core substitutes, and a row with none is a message
   * core renders as its own text.
   */
  describe("group boundaries and the # quoting scope", () => {
    it.each([
      {
        form: "an apostrophe before a letter in a plural branch as text",
        value: "{n, plural, other {it's {total}}}",
        expected: shape({ params: [num("n"), str("total")], plurals: { n: ["other"] } }),
      },
      {
        form: "a doubled apostrophe inside a quoted section as part of it",
        value: "'{it''s} {name}",
        expected: shape({}),
      },
      {
        form: "'# in a plain group as text, though a plural follows",
        value: "{a '#} {n, plural, other {#}}",
        expected: shape({ params: [str("a '#"), num("n")], plurals: { n: ["other"] } }),
      },
      {
        form: "'# in a plain group as text, though the text after it reads ', plural'",
        value: "{a '#}, plural",
        expected: shape({ params: [str("a '#")] }),
      },
      {
        form: "'# before a nested group as text",
        value: "{a '#{b}} {n, plural, other {#}}",
        expected: shape({ params: [str("a '#{b}"), num("n")], plurals: { n: ["other"] } }),
      },
      {
        form: "'# in a plural's name part as a quote, whatever follows the type",
        value: "{a '#, plural{x}}",
        expected: shape({}),
      },
      {
        form: "'# before a plural type that ends at the brace as a quote",
        value: "{a '#, plural}",
        expected: shape({}),
      },
      {
        form: "'# after a plural type that ends at a space as a quote",
        value: "{a, plural '#}",
        expected: shape({}),
      },
      {
        form: "'# after a selectordinal type as a quote",
        value: "{a, selectordinal '#}",
        expected: shape({}),
      },
      {
        form: "'# after another type as text",
        value: "{a, b '#}",
        expected: shape({ unsupported: "b '#" }),
      },
      {
        form: "'# inside a nested plural as a quote",
        value: "{x {n, plural, '#}}",
        expected: shape({}),
      },
      {
        form: "'# inside a nested plain group as text",
        value: "{x {'#}}",
        expected: shape({ params: [str("x {'#}")] }),
      },
      {
        form: "'# after a nested plural has closed as text again",
        value: "{g, select, a {{n, plural, other {#}}'#}'} other {y}}",
        expected: shape({}),
      },
      {
        form: "a quoted brace in a group's name",
        value: "{a'}{,'b}",
        expected: shape({ params: [str("a'}{,'b")] }),
      },
      {
        form: "an apostrophe before a comma as text",
        value: "{it's, x}",
        expected: shape({ unsupported: "x" }),
      },
      {
        form: "a braced part of the name before the comma",
        value: "{a {b}, select, x {1} other {2}}",
        expected: shape({ params: [str("a {b}")], selects: { "a {b}": ["x", "other"] } }),
      },
      {
        form: "a comma inside a braced part of the name as no separator",
        value: "{a {b, c}, select, x {1} other {2}}",
        expected: shape({ params: [str("a {b, c}")], selects: { "a {b, c}": ["x", "other"] } }),
      },
      {
        // The choice list is trimmed with `String.prototype.trim`, and the
        // gaps between branches are skipped by `charCodeAt <= 32`: a NUL is
        // only the second, a no-break space only the first. Core does both.
        form: "a NUL after the last branch as a gap",
        value: "{n, plural, other {x}\u0000}",
        expected: shape({ params: [num("n")], plurals: { n: ["other"] } }),
      },
      {
        form: "a no-break space after the last branch as trimmed",
        value: "{n, plural, other {x}\u00a0}",
        expected: shape({ params: [num("n")], plurals: { n: ["other"] } }),
      },
      {
        form: "a choice list whose selector swallows a quoted brace",
        value: "{g, select, '{'}",
        expected: shape({ unsupported: "select" }),
      },
      {
        form: "a choice list with a quoted closing brace before its selector",
        value: "{g, select, '} }}'{}}",
        expected: shape({ unsupported: "select" }),
      },
    ])("reads $form", ({ value, expected }) => {
      expect(scan(value)).toStrictEqual(expected);
    });
  });

  describe("tags", () => {
    it.each([
      {
        form: "an opening tag with its close",
        value: "<b>Hi</b> {name}",
        expected: shape({ params: [str("name")], tags: ["b"] }),
      },
      { form: "a self-closing tag", value: "Line<br/>break", expected: shape({ tags: ["br"] }) },
      {
        form: "a self-closing tag with a space",
        value: "Line<br />break",
        expected: shape({ tags: ["br"] }),
      },
      {
        form: "whitespace before the closing bracket",
        value: "<b >x</b >",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "names sorted, each once",
        value: "<i>a</i><b>b</b><i>c</i>",
        expected: shape({ tags: ["b", "i"] }),
      },
      {
        form: "name characters core allows",
        value: "<my-tag_2>x</my-tag_2>",
        expected: shape({ tags: ["my-tag_2"] }),
      },
      {
        form: "a tag nested in itself",
        value: "<b><b>x</b></b>",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "tags inside plural and select branches",
        value: "{n, plural, other {<b>#</b>}} {g, select, a {<i>x</i>} other {y}}",
        expected: shape({
          params: [num("n"), str("g")],
          plurals: { n: ["other"] },
          selects: { g: ["a", "other"] },
          tags: ["b", "i"],
        }),
      },
      {
        form: "an open with no close",
        value: "<b>open",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        form: "a close with no open",
        value: "close</b>",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        // Core requires strict nesting: a close for another tag aborts the
        // open one, so every tag here renders as text.
        form: "crossed tags",
        value: "<a><b>x</a></b>",
        expected: shape({ unbalancedTags: ["a", "b"] }),
      },
      {
        form: "an inner tag left open inside a closed one",
        value: "<a><i>x</a>",
        expected: shape({ unbalancedTags: ["a", "i"] }),
      },
      {
        form: "unbalanced names sorted",
        value: "</z></a>",
        expected: shape({ unbalancedTags: ["a", "z"] }),
      },
      {
        form: "a tag inside a quoted literal as text",
        value: "'{<b>}' {name}",
        expected: shape({ params: [str("name")] }),
      },
      {
        form: "a tag after a closed quote",
        value: "'{' <b>x</b>",
        expected: shape({ tags: ["b"] }),
      },
      { form: "the \\< escape as text", value: "a \\<b> c", expected: shape({}) },
      {
        form: "a backslash before anything else as text",
        value: "a\\b <i>x</i>",
        expected: shape({ tags: ["i"] }),
      },
      {
        // Core renders everything after it as text, the markup included.
        form: "a tag after an unclosed brace as text",
        value: "<i>x</i> { <b>y</b>",
        expected: shape({ tags: ["i"], unbalancedTags: ["b"] }),
      },
      {
        form: "a closed brace as no barrier",
        value: "{name} <b>y</b>",
        expected: shape({ params: [str("name")], tags: ["b"] }),
      },
      { form: "a less-than sign as text", value: "a < b and 1<2", expected: shape({}) },
      { form: "a name that starts with a digit as text", value: "<1>x</1>", expected: shape({}) },
      { form: "an empty close as text", value: "x</>", expected: shape({}) },
      { form: "an unterminated tag as text", value: "x <b", expected: shape({}) },
      { form: "a name followed by other text as text", value: "<b x>y</b x>", expected: shape({}) },
      { form: "a slash with no bracket as text", value: "<br/ >", expected: shape({}) },
      {
        form: "a self-closing close as text",
        value: "<b>x</b/>",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        form: "a tag right after a rejected one",
        value: "<<b>x</b>",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "the first and last letters and digits core allows",
        value: "<A>x</A> <Z/> <z0>y</z0> <a9/>",
        expected: shape({ tags: ["A", "Z", "a9", "z0"] }),
      },
      { form: "a character past 'z' as no tag name", value: "1 <}> 2", expected: shape({}) },
      { form: "a one-letter self-closing tag", value: "a<b/>c", expected: shape({ tags: ["b"] }) },
      {
        form: "'# as text at the top level, so a tag after it counts",
        value: "'#<b>x</b>",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "a backslash before a brace as no escape",
        value: "\\{ <b>x</b>",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        form: "no tag inside a placeholder's name",
        value: "{a '#<b>}",
        expected: shape({ params: [str("a '#<b>")] }),
      },
      {
        form: "a self-closing tag as a placeholder's name",
        value: "{<b/>}",
        expected: shape({ params: [str("<b/>")] }),
      },
      {
        form: "a quoted tag in a plural branch as text",
        value: "{n, plural, other {'#<b>x</b>' <i>y</i>}}",
        expected: shape({ params: [num("n")], plurals: { n: ["other"] }, tags: ["i"] }),
      },
      {
        form: "a quote closed inside a plural branch as no quote after it",
        value: "{n, plural, other {'#<b>x</b>'}} <i>y</i>",
        expected: shape({ params: [num("n")], plurals: { n: ["other"] }, tags: ["i"] }),
      },
      {
        form: "a brace a plural branch quotes as no unclosed brace",
        value: "{n, plural, other {'#{'}} <b>x</b>",
        expected: shape({ params: [num("n")], plurals: { n: ["other"] }, tags: ["b"] }),
      },
      {
        form: "an open in one branch and its close in another as two strays",
        value: "{g, select, a {<b>} other {</b>}}",
        expected: shape({
          params: [str("g")],
          selects: { g: ["a", "other"] },
          unbalancedTags: ["b"],
        }),
      },
      // Inside a tag an apostrophe quotes only when its quote closes, so
      // elision before a placeholder does not hide the close.
      { form: "elision inside a tag", value: "<b>l'{name}</b>", expected: shape({ tags: ["b"] }) },
      {
        form: "elision inside one tag beside another",
        value: "<i>dell'{name}</i> e <b>x</b>",
        expected: shape({ tags: ["b", "i"] }),
      },
      {
        form: "a balanced quote protecting a close inside a tag",
        value: "<b>'{x </b> y}' l'{name}</b>",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "a balanced quote hiding the only close inside a tag",
        value: "<b>'{</b>'",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        form: "a doubled apostrophe inside a balanced quote in a tag",
        value: "<b>'{it''s</b>'",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        form: "a quote that closes inside a tag, then a brace after it",
        value: "<b>'{'{</b>'",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "an unclosed brace inside a tag",
        value: "<b>{</b>",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "a lone brace inside a tag",
        value: "<b>x { y</b>",
        expected: shape({ tags: ["b"] }),
      },
      // Inside a tag a backslash skips the character after it, whatever it is.
      {
        form: "a doubled backslash inside a tag",
        value: "<b>C:\\\\</b>",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "a backslash that escapes the close inside a tag",
        value: "<b>C:\\</b>",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        form: "a close with a digit name inside a tag as a mismatch",
        value: "<b></1></b>",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        form: "a tag opened inside another and never closed",
        value: "<b>'<i>'</b>",
        expected: shape({ unbalancedTags: ["b", "i"] }),
      },
      {
        form: "an empty tag name inside a tag as text",
        value: "<b>1<>2</b>",
        expected: shape({ tags: ["b"] }),
      },
      {
        form: "a slash with no bracket inside a tag as text",
        value: "<b>a<x/</b>",
        expected: shape({ tags: ["b"] }),
      },
      {
        // Core keeps the last branch of a selector written twice. A select's
        // selectors are compared as written; a plural's as numbers.
        form: "two select branches whose selectors only look equal",
        value: "{g, select, =01 {<b/>} =1 {x} other {y}}",
        expected: shape({
          params: [str("g")],
          selects: { g: ["=01", "=1", "other"] },
          tags: ["b"],
        }),
      },
      {
        form: "no tag from a plural branch a later equal value overrides",
        value: "{n, plural, =1 {<b/>} =01 {x} other {y}}",
        expected: shape({ params: [num("n")], plurals: { n: ["=1", "other"] } }),
      },
      // Core keeps the last body of each selector AS WRITTEN, in the place
      // of its first appearance, and only then spells explicit values as
      // numbers — so of `=1`, `=01`, `=1` the body of `=01` wins.
      {
        form: "the body core picks among repeated numeric aliases",
        value: "{n, plural, =1 {<b/>} =01 {<i/>} =1 {<em/>} other {x}}",
        expected: shape({ params: [num("n")], plurals: { n: ["=1", "other"] }, tags: ["i"] }),
      },
      {
        form: "the body core picks among an ordinal's numeric aliases",
        value: "{n, selectordinal, =1 {<b/>} =1.0 {<i/>} =1 {<em/>} other {x}}",
        expected: shape({ params: [num("n")], ordinals: { n: ["=1", "other"] }, tags: ["i"] }),
      },
      {
        form: "an unclosed tag in the body core picks among numeric aliases",
        value: "{n, plural, =1 {<b/>} =01 {<i>} =1 {<em/>} other {x}}",
        expected: shape({
          params: [num("n")],
          plurals: { n: ["=1", "other"] },
          unbalancedTags: ["i"],
        }),
      },
      {
        form: "an alias written after the repeated selector it shadows",
        value: "{n, plural, =01 {<b/>} =1 {<i/>} =01 {<em/>} other {x}}",
        expected: shape({ params: [num("n")], plurals: { n: ["=1", "other"] }, tags: ["i"] }),
      },
      // A tag is never a refusal, even beside one.
      {
        form: "tags beside an unsupported argument",
        value: "<b>{total, number}</b>",
        expected: shape({ tags: ["b"], unsupported: "number" }),
      },
    ])("reads $form", ({ value, expected }) => {
      expect(scan(value)).toStrictEqual(expected);
    });
  });
});
