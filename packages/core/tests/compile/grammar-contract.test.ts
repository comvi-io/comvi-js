/**
 * The shared rich-text grammar contract, `contracts/icu-grammar.json` (B12): a never-closed
 * opening tag is its own text, a closing tag closes the nearest open tag of its name in its
 * sub-message, and the compiled tree is at most `depthLimit` levels high. The same rows are
 * read by @comvi/typegen's `readMessage` tests, by one row in every binding, and by the
 * platform's parser (a sha256-checked copy).
 *
 * Here: what `t()` renders in development, what it reports, and the development warning
 * each never-closed tag gets, in message order, at compile time. Production: tests/prod.
 */
import { describe, expect, it, vi } from "vitest";
import type { I18nError } from "../../src/errors";
import { createI18n } from "../../src/instance";
import { grammarCases, type GrammarCase } from "../grammar";

const cases = grammarCases();

function renderOnce(c: GrammarCase) {
  const errors: I18nError[] = [];
  const i18n = createI18n({
    locale: "en",
    messages: { en: { k: c.message } },
    onError: (e) => errors.push(e),
  });
  const out = i18n.t("k", c.params);
  return { i18n, out, errors };
}

/** The tag name of each never-closed warning printed so far, in order. */
const neverClosed = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls
    .map(([m]) => /^\[@comvi\/core\] `<([^>]*)>` in .* is never closed/.exec(m as string)?.[1])
    .filter((name) => name !== undefined);

describe("contracts/icu-grammar.json in @comvi/core (development)", () => {
  it.each(cases)("%s → the contract's render and error", (_, c) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { out, errors } = renderOnce(c);

    expect({ out, errors: errors.map((e) => e.code) }).toEqual(
      c.error === null ? { out: c.render, errors: [] } : { out: "k", errors: [c.error] },
    );
  });

  it.each(cases)(
    "%s → one warning per never-closed tag, in message order, none on a repeat t()",
    (_, c) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { i18n } = renderOnce(c);
      const first = neverClosed(warn);
      i18n.t("k", c.params);

      expect([first, neverClosed(warn)]).toEqual([c.unclosed, c.unclosed]);
    },
  );
});
