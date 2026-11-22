/**
 * contracts/icu-grammar.json through `readMessage` (B12): the schema the types are generated
 * from — params, and CLOSED tags only, ordered by the opening of each name's first closed
 * occurrence — the error, and the never-closed tags `comvi check` warns about. The same rows
 * run through @comvi/core (tests/compile/grammar-contract.test.ts) and the platform's parser.
 */
import { describe, expect, it } from "vitest";
import grammar from "../../../contracts/icu-grammar.json";
import { readMessage } from "../src/index";

interface Case {
  message: string;
  note?: string;
  schema: { params: unknown[]; tags: string[] } | null;
  error: "syntax" | null;
  unclosed: number;
}

/** A long row (the depth rows) is named by its note. */
const cases = (grammar.cases as Case[]).map(
  (c) => [c.message.length > 60 ? c.note! : c.message, c] as const,
);

describe("contracts/icu-grammar.json in readMessage", () => {
  it.each(cases)("%s → the contract's schema, error and never-closed tags", (_, c) => {
    const read = readMessage(c.message);

    expect({
      schema: read.error === undefined ? { params: read.params, tags: read.tags } : null,
      error: read.error === undefined ? null : "syntax",
      unclosed: read.unclosed.length,
    }).toEqual({ schema: c.schema, error: c.error, unclosed: c.unclosed });
  });
});

describe("readMessage on what the contract table does not show", () => {
  it("names each never-closed tag once per occurrence, in message order", () => {
    expect(readMessage("<i>a<b>x</b><br>{n, plural, other {<b>}}").unclosed).toEqual([
      "i",
      "br",
      "b",
    ]);
  });

  it("10,000 nested plurals are a syntax error, not a RangeError", () => {
    let message = "x";
    for (let i = 0; i < 10_000; i++) message = `{n, plural, other {${message}}}`;

    expect(readMessage(message).error).toBe("nested deeper than 200 levels");
  });

  it("a tag in a repeated selector's sub-message never renders: not in the schema, still never closed", () => {
    const read = readMessage("{n, plural, one {a} one {<b>x</b><i>} other {b}}");

    expect([read.tags, read.unclosed]).toEqual([[], ["i"]]);
  });
});
