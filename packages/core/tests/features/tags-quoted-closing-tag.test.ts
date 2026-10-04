/**
 * The closing-tag scanner used to skip backslash escapes but not ICU
 * apostrophe-quoted sections, so a `</b>` written inside quoted literal text
 * terminated the tag that surrounded it. The scanner now runs the parser's own
 * `advancePastApostrophe`, under the same `#`-is-syntax context the tag was
 * parsed in. RC review #7.
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../helpers/composedHost";
import type { TagCallbackParams, TranslationParams } from "../../src/types";

/** A handler per tag name, so an accepted tag shows up as `[name:children]`. */
function handlers(...names: string[]): TranslationParams {
  return Object.fromEntries(
    names.map((name) => [name, ({ children }: TagCallbackParams) => `[${name}:${children}]`]),
  );
}

function render(template: string, params: TranslationParams = {}): string {
  const i18n = createI18n({ locale: "en", messages: { en: { msg: template } } });
  return i18n.t("msg", params) as string;
}

describe("a closing tag inside an ICU-quoted section", () => {
  it("stays literal text inside the tag that surrounds it", () => {
    expect(render("<b>'{x </b> y}'</b>", handlers("b"))).toBe("[b:{x </b> y}]");
  });

  it("stays literal when the quote is opened by '}", () => {
    expect(render("<b>'}x </b> y{'</b>", handlers("b"))).toBe("[b:}x </b> y{]");
  });

  it("does not end the OUTER tag of a nested pair", () => {
    expect(render("<b><i>'{</i>}'</i>Z</b>", handlers("b", "i"))).toBe("[b:[i:{</i>}]Z]");
  });

  it("stays literal inside a plural sub-message, where # is syntax too", () => {
    expect(render("{n, plural, other {<b>'{# </b>}'</b> ok}}", { n: 2, ...handlers("b") })).toBe(
      "[b:{# </b>}] ok",
    );
  });
});

// ICU's DOUBLE_OPTIONAL rule says an UNMATCHED apostrophe quotes to the end of
// the message. Applied to the closing-tag scan that would reject the whole tag
// and leak its markup as visible text — and the shape it happens on is the
// French/Italian elision idiom before a placeholder, i.e. ordinary copy. `<` is
// not ICU syntax, so an apostrophe that never closes is the literal it looks
// like and the tag still closes. Combined review H1.
describe("an unterminated ICU quote inside a tag", () => {
  it.each([
    ["the French elision idiom", "<b>l'{name}</b>", "[b:l{name}]"],
    ["the Italian elision idiom", "<b>dell'{item}</b>", "[b:dell{item}]"],
    [
      "an apostrophe before a placeholder mid-sentence",
      "Type <c>'{name}</c> now",
      "Type [c:{name}] now",
    ],
    ["a nested tag around the unterminated quote", "<b><i>l'{x}</i></b>", "[b:[i:l{x}]]"],
  ])("closes the tag anyway — %s", (_label, template, expected) => {
    expect(render(template, handlers("b", "c", "i"))).toBe(expected);
  });

  it("does not warn about an unclosed tag when the rescan closes it", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(render("<b>l'{name}</b>", handlers("b"))).toBe("[b:l{name}]");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns about a genuinely unclosed tag once per parse, not once per scan", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });

    // A per-call fallback never passes through the ingestion preflight, so the
    // template is parsed exactly once and the count below is the scan's own.
    const out = i18n.t(
      "absent" as never,
      {
        fallback: "<wrapper>l'{name}",
        ...handlers("wrapper"),
      } as never,
    );

    expect(out).toBe("<wrapper>l{name}");
    expect(warnSpy.mock.calls.filter((c) => String(c[0]).includes("Unclosed tag"))).toEqual([
      ["[i18n] Unclosed tag: <wrapper>"],
    ]);
  });

  it("does not let the rescan reach a closing tag a BALANCED quote protects", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // The quote closes, so the first scan succeeds and the rescan never runs:
    // the `</b>` inside it stays the literal text finding #7 asked for.
    expect(render("<b>'{x </b> y}'</b>", handlers("b"))).toBe("[b:{x </b> y}]");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // One message can hold BOTH shapes: a balanced quote protecting a `</b>`
  // and an unterminated elision quote. Each apostrophe has to be judged on its
  // own quote, so the balanced one keeps the protection while the unterminated
  // one stays literal. Delta review D1.
  it.each([
    [
      "balanced quote first, elision second",
      "<b>'{x </b> y}' l'{name}</b>",
      "[b:{x </b> y} l{name}]",
    ],
    [
      // `'s` is not a quote start, so it consumes no apostrophe of the pair
      // that follows it. This is the only way round for an apostrophe of each
      // kind to sit in one message: see the note below.
      "a literal apostrophe first, balanced quote second",
      "<b>it's '{x </b> y}'</b>",
      "[b:it's {x </b> y}]",
    ],
    [
      "elision inside a balanced quote's own literal",
      "<b>'{l'' {x} </b>}' d'{b}</b>",
      "[b:{l' {x} </b>} d{b}]",
    ],
  ])("keeps the balanced quote protected — %s", (_label, template, expected) => {
    expect(render(template, handlers("b"))).toBe(expected);
  });

  // ICU pairs apostrophes sequentially, so an UNTERMINATED quote can only ever
  // be the last one in a message: anything that looks like "elision first,
  // balanced quote second" actually pairs the elision apostrophe with the
  // opener that follows it. In `<b>l'{name} '{y </b> z}'</b>` the quote is
  // therefore `{name} `, and the `</b>` is not inside a quote at all — it is
  // inside a braced argument, which this scanner has never skipped. Pinned as
  // the pre-existing limitation it is, NOT as desired output: a scanner taught
  // to skip balanced `{...}` would close at the second `</b>` and this
  // expectation would change.
  it("closes at a </b> inside a braced argument, which the scan does not skip", () => {
    expect(render("<b>l'{name} '{y </b> z}'</b>", handlers("b"))).toBe("[b:l{name} {y ] z}'</b>");
  });

  it("leaves the tag unclosed when a BALANCED quote runs to the last character", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // The quote closes, so the `</b>` inside it is protected and there is no
    // closing tag left outside it. Rejecting the tag is the #7 answer.
    expect(render("<b>'{x</b>}'", handlers("b"))).toBe("<b>{x</b>}");
    expect(warnSpy).toHaveBeenCalledWith("[i18n] Unclosed tag: <b>");
  });

  it("does not turn a tag MISMATCH into a match by rescanning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Quote-aware, the `</b>` is protected and the `</i>` mismatches, so the
    // tag is refused. A literal rescan would have found the protected `</b>`.
    // The refused tag leaves `<b>` literal and the top-level parse then
    // resolves the (balanced) quote itself, which is why the apostrophes go.
    expect(render("<b>'{</b>}'</i>", handlers("b", "i"))).toBe("<b>{</b>}</i>");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Tag mismatch"));
  });
});

describe("an apostrophe that ICU quoting does not claim", () => {
  // DOUBLE_OPTIONAL quoting opens a literal only before `{`, `}` or a `#` in
  // plural context. `'<` is none of those, so a `'</b>'` outside braces must
  // keep closing the tag exactly as it did.
  it("leaves a bare apostrophe as text and lets the tag close", () => {
    expect(render("<b>a'</b>", handlers("b"))).toBe("[b:a']");
  });

  it("collapses a doubled apostrophe without protecting what follows", () => {
    expect(render("<b>a''</b>", handlers("b"))).toBe("[b:a']");
  });

  it("still lets a backslash escape hide a closing tag", () => {
    expect(render("<b>a\\</b>b</b>", handlers("b"))).toBe("[b:a</b>b]");
  });
});
