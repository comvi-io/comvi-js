/**
 * THE PARITY GUARD for `scanMessageArguments`' ICU reading, next to the scanner.
 *
 * A copy of `@comvi/vite-plugin`'s `tests/extract-runtime-parity.test.ts`,
 * which stays where it is: this one drives the scanner directly, so mutation
 * testing of this package sees it. `src/message-shape.ts` scans translation
 * values for parameters, and `@comvi/core` decides at runtime which parameters
 * a message actually consumes. Those two answers have to be the same set: a
 * parameter the scanner invents is one the generated types demand and no
 * message reads, and a parameter it misses is one TypeScript rejects at a call
 * the runtime needs.
 *
 * Nothing here is a hand-written expectation. Each message is run through
 * `@comvi/core` with `icuCompiler`, the parameters the runtime consumes are
 * measured, and the scanner's set is compared against them. So a change to
 * core's grammar fails this file rather than silently desynchronizing the
 * generated types — the previous table of expectations could not.
 */

import { describe, expect, it } from "vitest";
import { createI18n, type TranslationParams } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { scanMessageArguments } from "../src/index";

/**
 * Every message form the scanner has an opinion about: the plain parameter,
 * each argument type core implements, each it does not, the malformed ones, and
 * ICU quoting.
 */
const MESSAGES = [
  // Plain parameters, including the spellings a name-shaped regex misses.
  "Hi {name}",
  "Hi {name }",
  "{ spaced }",
  "{name x}",
  "{0} items",
  "{a}{b}",
  "no parameters at all",

  // The three argument types core implements.
  "{count, plural, one {# item} other {# items}}",
  "{count, plural, one {item} other {items}}",
  "{place, selectordinal, other {#th}}",
  "{gender, select, male {he} female {she} other {they}}",
  "{count, plural, other {# of {total}}}",
  "{count, plural, other {#}} of {count}",
  "{count, plural, other {#}} {count, select, other {x}}",
  "{count,plural,other{#}}",
  "{ count , plural , other {#} }",

  // Argument types core does not implement, so the group renders literally.
  "{total, number}",
  "{total, number, percent}",
  "{when, date, short}",
  "{at, time}",
  "{at, time, short}",
  "{x, wobble, other {a}}",
  "{count, PLURAL, other {#}}",
  "Hi {name} and {total, number}",
  "{count, plural, other {# and {inner, number}}}",

  // Type names that merely START with a type core implements.
  "{n, pluralx, other {a}}",
  "{g, selection, other {a}}",

  // Malformed: a type with no choice list, and choice lists that do not parse.
  "{count, plural}",
  "{count, select}",
  "{count, plural, other}",
  "{count, plural, other {x} garbage}",
  "{count, select, male he}",
  "{count, plural, }",
  "{count, plural, 5 {x}}",

  // Unbalanced braces: everything from the unclosed brace on is literal text.
  "a { b {name}",
  "{name and {other}",

  // ICU apostrophe quoting.
  "'{name}' stays literal",
  "'{name}' but {real}",
  "It''s {name}",
  "''{name}''",
  "Superiors' behavior for {name}",
  "'}' closes nothing, {name} does",
  "{count, plural, other {'{total}' items}}",
  "{count, plural, other {'#' of {total}}}",
  "{count, plural, other {'}' {total}}}",
  "{gender, select, male {'{x}'} other {they}}",
  "'#' {n}",
  "'{name} and {other}",

  // Not in the vite-plugin copy: the gap after the last branch, which core
  // skips by `charCodeAt <= 32` (a NUL) and trims (a no-break space).
  "{n, plural, other {x}\u0000}",
  "{n, plural, other {x}\u00a0}",
] as const;

/**
 * What `@comvi/core` does with `template`: the parameter names it consumes, or
 * a refusal when it cannot compile the message at all.
 *
 * Consumption is measured rather than declared: a name is consumed when
 * changing its value changes the output. The candidate values include the
 * template's own words, because a `select` whose parameter matches no branch
 * always renders `other` and would otherwise look unused, and omission is tried
 * too, since a missing parameter renders as its own placeholder.
 *
 * One shape is out of reach either way: a `select` with a SINGLE branch renders
 * the same text for every value, so no probe can show that it reads its
 * parameter. Every select in the table below therefore carries two branches.
 *
 * A message carrying an argument type core does not implement (or a choice list
 * it cannot parse) is rejected outright by the ingestion preflight with
 * `E_ICU_SYNTAX`. Such a key is unusable, so the extractor must generate no
 * parameters for it: demanding one would force a call that throws, and
 * generating none leaves the key callable, which is what the production
 * fail-soft path renders anyway.
 */
function runtimeReading(template: string): { rejected: boolean; params: string[] } {
  let i18n;
  try {
    i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: icuCompiler,
      messages: { en: { message: template } },
      onError: () => undefined,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "E_ICU_SYNTAX") return { rejected: true, params: [] };
    throw error;
  }

  const render = (params: TranslationParams): string | null => {
    try {
      return i18n.t("message", params) as string;
    } catch (error) {
      if ((error as { code?: string }).code === "E_ICU_SYNTAX") return null;
      throw error;
    }
  };

  const candidates = [...new Set(template.match(/[A-Za-z_][\w ]*|\d+/g) ?? [])]
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate !== "");

  const pool: Array<string | number> = [1, 2, "A", "B", ...candidates];
  const base = Object.fromEntries(candidates.map((candidate) => [candidate, 1]));

  if (render(base) === null) return { rejected: true, params: [] };

  const params = candidates.filter((name) => {
    const outputs = new Set(pool.map((value) => render({ ...base, [name]: value })));
    const { [name]: _omitted, ...without } = base;
    outputs.add(render(without));
    return outputs.size > 1;
  });

  return { rejected: false, params };
}

/**
 * The parameters the shape names — after the projection the vite-plugin
 * applies, which drops every parameter of a message core refuses.
 */
function scannedParams(message: string): string[] {
  const scan = scanMessageArguments(message);
  return scan.unsupported !== undefined ? [] : scan.params.map((param) => param.name);
}

describe("scanMessageArguments against @comvi/core's own reading", () => {
  it("names exactly the parameters the runtime consumes, for every message form", () => {
    const divergences: string[] = [];

    for (const message of MESSAGES) {
      const runtime = runtimeReading(message);
      const expected = [...runtime.params].sort();
      const generated = [...scannedParams(message)].sort();

      if (JSON.stringify(expected) !== JSON.stringify(generated)) {
        divergences.push(
          `${JSON.stringify(message)}${runtime.rejected ? " [core rejects it]" : ""}` +
            `\n    runtime consumes ${JSON.stringify(expected)}` +
            `\n    typegen emits    ${JSON.stringify(generated)}`,
        );
      }
    }

    expect(divergences.join("\n  ")).toBe("");
  });
});
