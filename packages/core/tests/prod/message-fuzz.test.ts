/**
 * Property tests for the message grammar behind `t()`, PRODUCTION build
 * (`__DEV__` false) — the build where the contract is unconditional: whatever
 * string a catalog holds, `t()` returns a string. Development answers an
 * uncompilable ICU argument with `E_ICU_SYNTAX` at ingestion instead; that
 * half is `tests/features/message-fuzz.test.ts`.
 *
 * Seed, run count and how to read a failure: `tests/helpers/messageFuzz.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT,
  DEFAULT_TAGS,
  ICU,
  ICU_TAGS,
  VARIANTS,
  ingestAndRender,
} from "../helpers/fuzzInstances";
import {
  checkMessages,
  hasBuriedComma,
  plainText,
  FUZZ_RUNS,
  FUZZ_TIMEOUT_MS,
} from "../helpers/messageFuzz";

beforeEach(() => {
  // Malformed input warns by design (unbalanced braces, a missing parameter).
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("t() on generated messages (production build)", () => {
  it.each(VARIANTS)(
    "$name: any message → a string, within the time bound",
    (variant) => {
      const checked = checkMessages(`any message → a string (${variant.name})`, (message) => {
        const outcome = ingestAndRender(message, variant);

        expect(outcome).toEqual({ rejected: false, rendered: expect.any(String) });
      });

      expect(checked).toBe(FUZZ_RUNS);
    },
    FUZZ_TIMEOUT_MS,
  );

  // The template cache is module-global and keyed by the message, so the
  // second instance renders from what the first one compiled.
  it.each(VARIANTS)(
    "$name: a message rendered a second time, from the template cache → the same outcome",
    (variant) => {
      const checked = checkMessages(`cached ≡ compiled (${variant.name})`, (message) => {
        const compiled = ingestAndRender(message, variant);
        const cached = ingestAndRender(message, variant);

        expect(cached).toEqual(compiled);
      });

      expect(checked).toBe(FUZZ_RUNS);
    },
    FUZZ_TIMEOUT_MS,
  );

  // `<`, `&` and `\` are the only three characters the scanner offers to a
  // syntax extension, so a message without them cannot tell whether one is there.
  it.each([
    { name: "default compiler", bare: DEFAULT, tagged: DEFAULT_TAGS },
    { name: "icuCompiler", bare: ICU, tagged: ICU_TAGS },
  ])(
    "$name: a message with no `<`, `&` or `\\` → the same outcome with and without the tag grammar",
    ({ name, bare, tagged }) => {
      const checked = checkMessages(
        `tag grammar is inert (${name})`,
        (message) => {
          const withoutTags = ingestAndRender(message, bare);
          const withTags = ingestAndRender(message, tagged);

          expect(withTags).toEqual(withoutTags);
        },
        { where: (message) => !/[<&\\]/.test(message) },
      );

      expect(checked).toBeGreaterThan(FUZZ_RUNS / 10);
    },
    FUZZ_TIMEOUT_MS,
  );

  // "No ICU construct" is narrower than "no `{`": ICU quoting is part of the
  // grammar with no brace in sight. `''` is an escaped apostrophe and renders
  // as one, and an apostrophe directly before `}` opens a quoted section and
  // is consumed. Every other apostrophe is literal text. Without the tag
  // grammar on the instance `<`, `&` and `\` are plain characters too.
  it.each([DEFAULT, ICU])(
    "$name: a message with no `{`, no `''` and no `'}` → returned unchanged",
    (variant) => {
      const checked = checkMessages(
        `plain text → unchanged (${variant.name})`,
        (message) => {
          const outcome = ingestAndRender(message, variant);

          expect(outcome.rendered).toBe(message);
        },
        { generate: plainText, where: (message) => !/''|'\}/.test(message) },
      );

      expect(checked).toBeGreaterThan(FUZZ_RUNS / 2);
    },
    FUZZ_TIMEOUT_MS,
  );

  // Narrowed twice. "Without plural/select" is tested on the WORDS, because an
  // almost-well-formed `{n, plural other {x}}` is still plural syntax to one
  // compiler and not to the other. And a comma buried in a nested brace group
  // or next to a quote is excluded: the compilers disagree on whether it makes
  // the argument typed — see `hasBuriedComma` and the `it.fails` case below.
  it(
    "a message without plural/select → the same text from both compilers",
    () => {
      const checked = checkMessages(
        "default compiler ≡ icuCompiler",
        (message) => {
          const simple = ingestAndRender(message, DEFAULT);
          const icu = ingestAndRender(message, ICU);

          expect(icu).toEqual(simple);
        },
        { where: (message) => !/plural|select/.test(message) && !hasBuriedComma(message) },
      );

      expect(checked).toBeGreaterThan(FUZZ_RUNS / 4);
    },
    FUZZ_TIMEOUT_MS,
  );
});

describe("counterexamples the fuzzer found (production build)", () => {
  // BUG (low): `icuCompiler` looks for the type-marking comma only at the
  // argument's own brace depth, so `{{,}\t}` is to it a PARAMETER named `{,}`.
  // The missing-parameter literal then drops the tab. The default compiler
  // sees the comma, calls the argument ICU and echoes the segment verbatim.
  // Observed: "{{,}}". Expected: "{{,}\t}", byte for byte, as from the default
  // compiler — an argument neither compiler can compile should not be rewritten.
  it.fails("icuCompiler: a comma inside a nested brace group → the segment verbatim", () => {
    const outcome = ingestAndRender("{{,}\t}", ICU);

    expect(outcome.rendered).toBe("{{,}\t}");
  });

  it("default compiler: a comma inside a nested brace group → the segment verbatim", () => {
    const outcome = ingestAndRender("{{,}\t}", DEFAULT);

    expect(outcome.rendered).toBe("{{,}\t}");
  });

  // BUG (low): the parser and the renderer recurse once per nesting level, so
  // a message nested about 1,250 levels deep (measured on Node 24) overflows
  // the stack and `t()` throws RangeError — in development already at
  // ingestion. No real translation nests like this; a hostile or corrupted
  // catalog can. 5,000 levels leaves a 4x margin over the measured threshold.
  // Observed: RangeError "Maximum call stack size exceeded". Expected: a string.
  it.fails("icuCompiler + tags: tags nested 5,000 deep → a string", () => {
    const message = "<b>".repeat(5000) + "x" + "</b>".repeat(5000);

    const outcome = ingestAndRender(message, ICU_TAGS);

    expect(outcome.rendered).toBe("x");
  });

  it.fails("icuCompiler: plurals nested 5,000 deep → a string", () => {
    const message = "{n, plural, other {".repeat(5000) + "x" + "}}".repeat(5000);

    const outcome = ingestAndRender(message, ICU);

    expect(outcome.rendered).toBe("x");
  });

  it("icuCompiler + tags: tags and plurals nested 200 deep → the innermost text", () => {
    const message = "<b>{n, plural, other {".repeat(200) + "x" + "}}</b>".repeat(200);

    const outcome = ingestAndRender(message, ICU_TAGS);

    expect(outcome.rendered).toBe("x");
  });
});
