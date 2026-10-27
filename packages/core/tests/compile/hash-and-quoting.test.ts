/**
 * `#` scope (R3-9) and ICU apostrophe quoting.
 * Ported by meaning from: icu-hash-scope, icu-hash-scope-detection, icu-hash-lazy-format,
 * top-level-hash-quoting, parser-escapes-and-boundaries, parser-brace-scanning. The
 * old icu-hash-scope tests pinned `#` → number inside a select nested in a plural;
 * ICU4C prints a literal `#` there, and so does core now (owner decision 27.10).
 */
import { describe, expect, it, vi } from "vitest";
import { compile, render } from "../../src/compile/cache";
import { fmt } from "../helpers";

describe("# scope", () => {
  it("is the count in the immediate sub-message of plural and selectordinal", () => {
    expect(fmt("{n, plural, other {# and #}}", { n: 1234 })).toBe("1,234 and 1,234");
    expect(fmt("{n, selectordinal, other {#.}}", { n: 3 }, "de")).toBe("3.");
  });

  it("inside a tag inside the sub-message is still the count (tags are not arguments)", () => {
    expect(
      fmt("{n, plural, other {<b>#</b> items}}", {
        n: 2,
        b: (c: readonly unknown[]) => `[${c[0]}]`,
      }),
    ).toBe("[2] items");
  });

  it("belongs to the nearest plural", () => {
    expect(fmt("{a, plural, other {# {b, plural, other {#}} #}}", { a: 1, b: 2 })).toBe("1 2 1");
  });

  it("is a literal at the top level and in a top-level select", () => {
    expect(fmt("# {g, select, other {#}}", { g: "x" })).toBe("# #");
  });

  it("is a literal inside a select nested in a plural (ICU4C), and so is '#'", () => {
    expect(fmt("{n, plural, other {{g, select, other {# '#' x}}}}", { n: 5, g: "x" })).toBe(
      "# '#' x",
    );
  });

  it("warns in development once per (key, locale) about the literal", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = compile("{n, plural, other {{g, select, other {# items}}}}", "cart.items");
    render(c, { n: 1, g: "x" }, "en");
    render(c, { n: 2, g: "x" }, "en");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('"cart.items"');
    expect(warn.mock.calls[0][0]).toContain("{g, select, female {{n, plural, …}} …}");
    render(c, { n: 2, g: "x" }, "de");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("does not warn for a # that is the count, or a # outside any plural", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fmt("{n, plural, other {#}} # {g, select, other {#}}", { n: 1, g: "x" });
    fmt("{g, select, other {{n, plural, other {#}}}}", { n: 1, g: "x" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("never formats the count when the branch has no #", () => {
    const spy = vi.spyOn(Intl, "NumberFormat");
    expect(fmt("{n, plural, other {many}}", { n: 123456 })).toBe("many");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("apostrophe quoting", () => {
  it.each([
    ["It''s", "It's"],
    ["I'm here", "I'm here"],
    ["'{x}'", "{x}"],
    ["'{'x'}'", "{x}"],
    ["a '' b", "a ' b"],
    ["'{a''b}'", "{a'b}"],
    ["'{unterminated", "{unterminated"],
    ["'<b>' is a tag", "<b> is a tag"],
    ["top '#' stays", "top '#' stays"],
    ["trailing '", "trailing '"],
    ["''{x}''", "'1'"],
  ])("%s → %s", (template, expected) => {
    expect(fmt(template, { x: 1 })).toBe(expected);
  });

  it("quotes # only where # is syntax", () => {
    expect(fmt("{n, plural, other {'#' is #}}", { n: 2 })).toBe("# is 2");
  });

  it("lets a quoted } inside a sub-message stay text", () => {
    expect(fmt("{n, plural, other {a '}' b}}", { n: 1 })).toBe("a } b");
  });

  it("an unquoted } at the top level is text", () => {
    expect(fmt("a } b {x} }", { x: 1 })).toBe("a } b 1 }");
  });
});

describe("unicode", () => {
  it("keeps emoji and surrogate pairs whole around arguments", () => {
    expect(fmt("🎉{x}🎉", { x: "😀" })).toBe("🎉😀🎉");
    expect(fmt("{n, plural, one {# 🍎} other {# 🍎🍎}}", { n: 2 })).toBe("2 🍎🍎");
    expect(fmt("{g, select, 🐱 {cat} other {?}}", { g: "🐱" })).toBe("cat");
    expect(fmt("\ud800{x}", { x: 1 })).toBe("\ud8001");
  });
});
