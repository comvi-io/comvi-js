/**
 * Rich-text tags are always on (R3-11): `<b>…</b>`, `<br/>`; the handler is the
 * parameter of the same name; without one the children render inline with a
 * development warning once per (key, tag).
 * Ported by meaning from: tag-interpolation, tags-fallback-paths, tags-scanner-boundaries,
 * tags-quoted-closing-tag, emoji-unicode (tags).
 */
import { describe, expect, it, vi } from "vitest";
import { fmt } from "../helpers";

const wrap =
  (name: string) =>
  (c: readonly unknown[]): { name: string; c: readonly unknown[] } => ({ name, c });

describe("tags", () => {
  it("passes the children to the handler and returns rich parts", () => {
    expect(fmt("Read <link>the terms</link>.", { link: wrap("a") })).toEqual([
      "Read ",
      { name: "a", c: ["the terms"] },
      ".",
    ]);
  });

  it("returns a string when every handler returns a string", () => {
    expect(
      fmt("<b>bold</b> and <i>it</i>", {
        b: (c: readonly unknown[]) => `*${c.join("")}*`,
        i: () => "_",
      }),
    ).toBe("*bold* and _");
  });

  it("nests tags and renders params, plurals and selects inside them", () => {
    expect(
      fmt("<b>{name} <i>{n, plural, one {# cat} other {# cats}}</i></b>", {
        b: wrap("b"),
        i: wrap("i"),
        name: "Ann",
        n: 3,
      }),
    ).toEqual([{ name: "b", c: ["Ann ", { name: "i", c: ["3 cats"] }] }]);
  });

  it("self-closing tags get no children", () => {
    expect(fmt("a<br/>b<br />c", { br: wrap("br") })).toEqual([
      "a",
      { name: "br", c: [] },
      "b",
      { name: "br", c: [] },
      "c",
    ]);
  });

  it("accepts snake_case and kebab-case names and spaces before >", () => {
    expect(fmt("<my_tag >x</my_tag ><x-y>z</x-y>", { my_tag: () => "1", "x-y": () => "2" })).toBe(
      "12",
    );
  });

  it.each([
    ["a < b", "a < b"],
    ["<1>x", "<1>x"],
    ["x > y", "x > y"],
    ["<br/y>", "<br/y>"],
    ["< b>", "< b>"],
    ["'<b>'x'</b>'", "<b>x</b>"],
  ])("%s is text, not a tag", (template, want) => {
    expect(fmt(template, { b: () => "TAG", br: () => "BR" })).toBe(want);
  });

  it("without a handler renders the children and warns once per (key, tag) in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(fmt("<b>bold</b> <b>again</b>", {}, "en", undefined, "msg")).toBe("bold again");
    fmt("<b>x</b>", {}, "de", undefined, "msg");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(
      '[@comvi/core] <b> in "msg" has no handler; its children render as plain text',
    );
  });

  it("a non-function parameter of the tag's name is not a handler", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(fmt("<b>x</b>", { b: "nope" })).toBe("x");
  });

  it("quoting protects a closing tag inside the children", () => {
    expect(fmt("<b>a '</b>' c</b>", { b: wrap("b") })).toEqual([{ name: "b", c: ["a </b> c"] }]);
  });

  it("keeps emoji whole inside a tag", () => {
    expect(fmt("<b>🎉</b>", { b: wrap("b") })).toEqual([{ name: "b", c: ["🎉"] }]);
  });

  it("merges adjacent strings around a rich part", () => {
    const node = { el: 1 };
    expect(fmt("a{x}b<b>c</b>d", { x: "X", b: () => node })).toEqual(["aXb", node, "d"]);
  });

  it("spreads nested rich parts instead of nesting arrays", () => {
    const node = { el: 1 };
    expect(fmt("{n, plural, other {a <b>x</b> b}}", { n: 1, b: () => node })).toEqual([
      "a ",
      node,
      " b",
    ]);
  });
});
