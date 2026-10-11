/**
 * Property tests for the message grammar behind `t()`, DEVELOPMENT build.
 *
 * Development is deliberately not "never throws": an ICU argument the
 * instance's compiler cannot compile is refused with `E_ICU_SYNTAX` when the
 * catalog is ingested. So the claim here is the pair — ingestion refuses with
 * exactly that code or accepts, and an accepted message renders without
 * throwing. The unconditional claim is the production suite,
 * `tests/prod/message-fuzz.test.ts`.
 *
 * Seed, run count and how to read a failure: `tests/helpers/messageFuzz.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createI18n } from "../../src";
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
  wellFormed,
  FUZZ_RUNS,
  FUZZ_TIMEOUT_MS,
} from "../helpers/messageFuzz";

/** A plural/select/selectordinal argument header: `, plural,` with any ASCII whitespace. */
const TYPED_ARGUMENT = /,\s*(plural|select|selectordinal)\s*,/;

beforeEach(() => {
  // Malformed input warns by design (unbalanced braces, an unclosed tag, a
  // missing parameter, tag syntax no extension claims).
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("t() on generated messages (development build)", () => {
  // The generator's bounds (nesting, run length, message size) are part of
  // this claim; they are stated in the production suite, with COM-147.
  it.each(VARIANTS)(
    "$name: any message → refused with E_ICU_SYNTAX at ingestion, or rendered to a string",
    (variant) => {
      const checked = checkMessages(
        `any message → refused or a string (${variant.name})`,
        (message) => {
          const outcome = ingestAndRender(message, variant);

          expect(typeof outcome.rendered).toBe(outcome.rejected ? "undefined" : "string");
        },
      );

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

  // See the production suite for why "no ICU construct" names `''` and `'}`.
  it.each([DEFAULT, ICU])(
    "$name: a message with no `{`, no `''` and no `'}` → returned unchanged",
    (variant) => {
      const checked = checkMessages(
        `plain text → unchanged (${variant.name})`,
        (message) => {
          const outcome = ingestAndRender(message, variant);

          expect(outcome).toEqual({ rejected: false, rendered: message });
        },
        { generate: plainText, where: (message) => !/''|'\}/.test(message) },
      );

      expect(checked).toBeGreaterThan(FUZZ_RUNS / 2);
    },
    FUZZ_TIMEOUT_MS,
  );

  // The narrowing is explained in the production suite. "The same" covers
  // the refusal as well: `{price, number}` is refused by both.
  it(
    "a message without plural/select → the same outcome from both compilers",
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

  // The deep paths: a plural in a tag in a select, three levels down. Accepted
  // means every argument compiled, so no argument header survives as text.
  it(
    "icuCompiler + tags: a grammatical message → accepted, with no argument left uncompiled",
    () => {
      const checked = checkMessages(
        "grammatical → compiled",
        (message) => {
          const outcome = ingestAndRender(message, ICU_TAGS);

          expect(outcome.rejected).toBe(false);
          expect(outcome.rendered).not.toMatch(/, (plural|select|selectordinal),/);
        },
        { generate: wellFormed },
      );

      expect(checked).toBe(FUZZ_RUNS);
    },
    FUZZ_TIMEOUT_MS,
  );
});

describe("counterexamples the fuzzer found (development build)", () => {
  const WRAPPED_PLURAL = "{{count, plural, one {# item} other {# items}}}";

  // BUG (low): `icuCompiler` looks for the type-marking comma only at the
  // argument's own brace depth, so a plural wrapped in a second pair of braces
  // is to it a PARAMETER whose name is the whole inner argument. It is accepted
  // and rendered literally, with nothing but a missing-parameter warning; the
  // default compiler refuses the same catalog.
  // Observed: accepted. Expected: refused with E_ICU_SYNTAX.
  it.fails(
    "icuCompiler: a plural wrapped in a second pair of braces → refused at ingestion",
    () => {
      const outcome = ingestAndRender(WRAPPED_PLURAL, ICU);

      expect(outcome.rejected).toBe(true);
    },
  );

  it("default compiler: a plural wrapped in a second pair of braces → refused at ingestion", () => {
    const outcome = ingestAndRender(WRAPPED_PLURAL, DEFAULT);

    expect(outcome.rejected).toBe(true);
  });

  // BUG (medium, COM-146): a FUNCTION-valued parameter is a tag handler, and
  // a `{link}` placeholder of the same name puts its source code in the
  // output. `String()` coercion of a non-primitive parameter is the documented
  // behaviour (`docs/design/rich-text.md`, `TranslationParamValue` in
  // `types.ts`); the fault is a function reaching text output at all.
  // Observed: "() => \"handled\"". Expected: "{link}", as with no parameter.
  it.fails.each([DEFAULT, ICU])(
    "$name: a placeholder whose parameter is a tag handler → the literal placeholder",
    (variant) => {
      const i18n = createI18n({
        locale: "en",
        exposeGlobal: false,
        ...variant.options,
        messages: { en: { message: "{link}" } },
      });

      const rendered = i18n.t("message", { link: () => "handled" });

      expect(rendered).toBe("{link}");
    },
  );

  it.each([DEFAULT, ICU])(
    "$name: a placeholder with no parameter of that name → the literal placeholder",
    (variant) => {
      const i18n = createI18n({
        locale: "en",
        exposeGlobal: false,
        ...variant.options,
        messages: { en: { message: "{link}" } },
      });

      const rendered = i18n.t("message", {});

      expect(rendered).toBe("{link}");
    },
  );
});
