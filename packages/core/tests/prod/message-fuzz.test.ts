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

/** A plural/select/selectordinal argument header: `, plural,` with any ASCII whitespace. */
const TYPED_ARGUMENT = /,\s*(plural|select|selectordinal)\s*,/;

beforeEach(() => {
  // Malformed input warns by design (unbalanced braces, a missing parameter).
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("t() on generated messages (production build)", () => {
  // "Any message" is what the generator draws, and its bounds are part of the
  // claim: nesting up to 4 levels, runs of up to 40 repeated units, messages
  // up to a few thousand UTF-16 units. Past them — thousands of nesting levels
  // (stack depth) or thousands of unclosed tags (a quadratic closing-tag
  // scan) — is recorded as COM-147 and not claimed here.
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

  // Narrowed once beyond "without plural/select" (no `, plural,` / `, select,`
  // / `, selectordinal,` header): a comma buried in a nested brace group or
  // next to a quote is excluded, because the compilers disagree on whether it
  // makes the argument typed — see `hasBuriedComma`. In production that shows
  // only as padding: `icuCompiler` renders such an argument as a missing
  // parameter, whose name is trimmed, and the default compiler verbatim.
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
        { where: (message) => !TYPED_ARGUMENT.test(message) && !hasBuriedComma(message) },
      );

      expect(checked).toBeGreaterThan(FUZZ_RUNS / 4);
    },
    FUZZ_TIMEOUT_MS,
  );
});

describe("shapes the fuzzer led to (production build)", () => {
  // The development suite pins the divergence this message exposes there;
  // production has none, and that is worth holding on to.
  it.each([DEFAULT, ICU])(
    "$name: a plural wrapped in a second pair of braces → the segment verbatim",
    (variant) => {
      const outcome = ingestAndRender("{{count, plural, one {# item} other {# items}}}", variant);

      expect(outcome.rendered).toBe("{{count, plural, one {# item} other {# items}}}");
    },
  );

  // The supported range for nesting, far past anything a translation holds.
  // Beyond the fuzzer's bounds — see the first property — is COM-147.
  it("icuCompiler + tags: a tag, a plural and a select nested 100 deep → the innermost text", () => {
    const message =
      "<b>{n, plural, other {{gender, select, other {".repeat(100) + "x" + "}}}}</b>".repeat(100);

    const outcome = ingestAndRender(message, ICU_TAGS);

    expect(outcome.rendered).toBe("x");
  });
});
