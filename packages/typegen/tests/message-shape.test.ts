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
    ordinals: [],
    selects: {},
    tags: [],
    unbalancedTags: [],
    ...expected,
  };
}

function scan(value: string): MessageShape {
  const result = scanMessageShape(value);
  return { ...result, plurals: { ...result.plurals }, selects: { ...result.selects } };
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
          plurals: { place: ["other"] },
          ordinals: ["place"],
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
          plurals: { p: ["one", "other"] },
          ordinals: ["p"],
        }),
      },
      {
        form: "a cardinal plural as no ordinal",
        value: "{a, selectordinal, other {#}} {b, plural, other {#}}",
        expected: shape({
          params: [num("a"), num("b")],
          plurals: { a: ["other"], b: ["other"] },
          ordinals: ["a"],
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
      const result = scanMessageShape("{n, plural, other {#}} {g, select, a {x} other {y}}");

      expect(Object.getPrototypeOf(result.plurals)).toBeNull();
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
        expected: shape({ tags: ["b"], unbalancedTags: ["b"] }),
      },
      {
        form: "a close with no open",
        value: "close</b>",
        expected: shape({ unbalancedTags: ["b"] }),
      },
      {
        form: "crossed tags",
        value: "<a><b>x</a></b>",
        expected: shape({ tags: ["a", "b"], unbalancedTags: ["b"] }),
      },
      {
        form: "an inner tag left open inside a closed one",
        value: "<a><i>x</a>",
        expected: shape({ tags: ["a", "i"], unbalancedTags: ["i"] }),
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
        form: "nothing after an unclosed brace",
        value: "<i>x</i> { <b>y</b>",
        expected: shape({ tags: ["i"] }),
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
        expected: shape({ tags: ["b"], unbalancedTags: ["b"] }),
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
        expected: shape({}),
      },
      {
        form: "a tag inside a group closed under the top level's # rule",
        value: "{a '#<b>}",
        expected: shape({ params: [str("a '#<b>")], tags: ["b"], unbalancedTags: ["b"] }),
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
