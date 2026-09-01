import { describe, it, expect, beforeEach, vi } from "vitest";
import { createI18n } from "../helpers/composedHost";

/**
 * Which byte sequences the tag scanner accepts as markup and which it leaves
 * as text. A rejected tag renders as its own source, an accepted one renders
 * through its handler, so the two are told apart by the rendered string.
 */

/** A handler per tag name, so an accepted tag shows up as `[name:children]`. */
function handlers(...names: string[]): Record<string, unknown> {
  return Object.fromEntries(
    names.map((name) => [name, ({ children }: { children: string }) => `[${name}:${children}]`]),
  );
}

function render(template: string, params: Record<string, unknown> = {}): string {
  const i18n = createI18n({ locale: "en", translation: { en: { msg: template } } });
  return i18n.t("msg", params) as string;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("tag name — first character after `<`", () => {
  it.each([
    ["A", "<A>x</A>"],
    ["Z", "<Z>x</Z>"],
    ["a", "<a>x</a>"],
    ["z", "<z>x</z>"],
  ])("ASCII letter %s opens a tag → the handler renders its children", (name, template) => {
    const rendered = render(template, handlers(name));

    expect(rendered).toBe(`[${name}:x]`);
  });

  it.each([
    ["@ — one below A", "<@>x</@>"],
    ["[ — one above Z", "<[>x</[>"],
    ["` — one below a", "<`>x</`>"],
    ["~ — above z", "<~>x</~>"],
    ["- — a name character but not a name START character", "<->x</->"],
    ["_ — a name character but not a name START character", "<_>x</_>"],
    ["9 — a name character but not a name START character", "<9>x</9>"],
  ])("%s opens no tag → the template renders as its own source", (_label, template) => {
    const rendered = render(template);

    expect(rendered).toBe(template);
  });
});

describe("tag name — characters after the first", () => {
  it.each([
    ["bA", "<bA>x</bA>"],
    ["bZ", "<bZ>x</bZ>"],
    ["ba", "<ba>x</ba>"],
    ["bz", "<bz>x</bz>"],
    ["b0", "<b0>x</b0>"],
    ["b9", "<b9>x</b9>"],
    ["b-c", "<b-c>x</b-c>"],
    ["b_c", "<b_c>x</b_c>"],
  ])("%s is one complete tag name → the handler renders its children", (name, template) => {
    const rendered = render(template, handlers(name));

    expect(rendered).toBe(`[${name}:x]`);
  });

  it.each([
    ["@ — one below A", "<b@>x</b@>"],
    ["[ — one above Z", "<b[>x</b[>"],
    ["` — one below a", "<b`>x</b`>"],
    ["~ — above z", "<b~>x</b~>"],
  ])(
    "%s ends the name and is neither `>` nor `/` → the template renders as its own source",
    (_label, template) => {
      const rendered = render(template);

      expect(rendered).toBe(template);
    },
  );
});

describe("whitespace between a tag name and the bracket that closes it", () => {
  it("a space before `>` in an opening tag → the tag still opens", () => {
    const rendered = render("<b >x</b>", handlers("b"));

    expect(rendered).toBe("[b:x]");
  });

  it("a tab before `>` in an opening tag → the tag still opens", () => {
    const rendered = render("<b\t>x</b>", handlers("b"));

    expect(rendered).toBe("[b:x]");
  });

  it("a space before `>` in a closing tag → the tag still closes", () => {
    const rendered = render("<b>x</b >", handlers("b"));

    expect(rendered).toBe("[b:x]");
  });

  it("a space before `>` of a NESTED opening tag → the nested tag still opens", () => {
    const rendered = render("<b>x<i >y</i>z</b>", handlers("b", "i"));

    expect(rendered).toBe("[b:x[i:y]z]");
  });

  it("a space before the `/` of a self-closing tag → the tag still self-closes", () => {
    const rendered = render("a<br />b", handlers("br"));

    expect(rendered).toBe("a[br:]b");
  });
});

describe("self-closing tags", () => {
  // Stronger than tag-interpolation.test.ts's `<br/>` handler test, which does
  // not pin that the handler receives EMPTY children.
  it("`<br/>` → the handler runs with empty children", () => {
    const rendered = render("a<br/>b", handlers("br"));

    expect(rendered).toBe("a[br:]b");
  });

  it("a `/` not followed by `>` → the tag is rejected", () => {
    const rendered = render("a<br/x>b");

    expect(rendered).toBe("a<br/x>b");
  });

  it("a `/` at the very end of the template → the tag is rejected", () => {
    const rendered = render("a<br/");

    expect(rendered).toBe("a<br/");
  });

  it("a self-closing tag inside a body → no scope for the closing tag to match", () => {
    const rendered = render("<b>x<br/>y</b>", handlers("b", "br"));

    expect(rendered).toBe("[b:x[br:]y]");
  });

  it("a self-closing tag at the start of a body → no scope opened", () => {
    const rendered = render("<b><i/>x</b>", handlers("b", "i"));

    expect(rendered).toBe("[b:[i:]x]");
  });

  it("`<br/y>` → not self-closing, and it stays inside the body as text", () => {
    const rendered = render("<b>x<br/y>z</b>", handlers("b"));

    expect(rendered).toBe("[b:x<br/y>z]");
  });

  it("a `/` followed by `<` → not self-closing, so the tag that `<` opens still nests", () => {
    const rendered = render("<a>x<br/<b>y</b>z</a>", handlers("a", "b"));

    expect(rendered).toBe("[a:x<br/[b:y]z]");
  });
});

describe("scanning a tag body for its closing tag", () => {
  it("a nested tag whose body starts with `>` → the nested tag still opens a scope", () => {
    const rendered = render("<b>x<i>>y</i>z</b>", handlers("b", "i"));

    expect(rendered).toBe("[b:x[i:>y]z]");
  });

  it("`<1>` in a body → no scope opened, and it stays text", () => {
    const rendered = render("<b>a<1>c</b>", handlers("b"));

    expect(rendered).toBe("[b:a<1>c]");
  });

  it("a bare `>` in a body → ordinary text", () => {
    const rendered = render("<b>a b>c</b>", handlers("b"));

    expect(rendered).toBe("[b:a b>c]");
  });

  it("a backslash before `</b>` → it hides the `<`, so that is not the closing tag", () => {
    const rendered = render("<b>a\\</b>x</b>", handlers("b"));

    expect(rendered).toBe("[b:a</b>x]");
  });
});

describe("input the scanner refuses", () => {
  it.each([
    ["template ends right after the tag name", "a<b"],
    ["template ends after the tag name and a space", "a<b "],
    ["closing tag missing its `>`", "<b>hi</b"],
    ["closing tag with a stray word before `>`", "<b>hi</b x>"],
    ["empty tag name", "<>hi</>"],
    ["a closing tag with no opener", "a</b>c"],
    ["opening tag never closed", "<b>hi"],
    ["a name ended by `@`, even though a matching closing tag follows", "<b@x</b>"],
  ])("%s → the template renders as its own source", (_label, template) => {
    const rendered = render(template);

    expect(rendered).toBe(template);
  });

  it("names the unclosed tag in the development warning", () => {
    const rendered = render("<wrapper>text");

    expect(rendered).toBe("<wrapper>text");
    expect(warnSpy).toHaveBeenCalledWith("[i18n] Unclosed tag: <wrapper>");
  });
});

// A superset of tag-interpolation.test.ts's single "escapes backslash and HTML
// entities" test: it covers `\<` and `&lt;`/`&gt;` only.
describe("the `\\<` escape and the `&…;` entities", () => {
  it.each([
    { of: "`\\<`", template: "a\\<b", expected: "a<b" },
    { of: "a backslash before anything else", template: "a\\b", expected: "a\\b" },
    { of: "a backslash with a PRECEDING `<`", template: "<\\b", expected: "<\\b" },
    { of: "a trailing backslash", template: "a\\", expected: "a\\" },
    { of: "the three owned entities", template: "&lt;&gt;&amp;", expected: "<>&" },
    { of: "an unknown entity", template: "&nbsp;", expected: "&nbsp;" },
    { of: "a bare ampersand", template: "a&", expected: "a&" },
  ])("$of: $template → $expected", ({ template, expected }) => {
    const rendered = render(template);

    expect(rendered).toBe(expected);
  });
});
