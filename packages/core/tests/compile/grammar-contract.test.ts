/**
 * The shared rich-text grammar contract, `contracts/icu-grammar.json` (B12): a never-closed
 * opening tag is its own text, a closing tag closes the nearest open tag of its name in its
 * sub-message, and the compiled tree is at most `depthLimit` levels high. The same rows are
 * read by @comvi/typegen's `readMessage` tests, by one row in every binding, and by the
 * platform's parser (a sha256-checked copy).
 *
 * Here: what `t()` renders in development, what it reports, and the one development warning
 * each never-closed tag gets at compile time. The production arms: tests/prod.
 */
import { describe, expect, it, vi } from "vitest";
import grammar from "../../../../contracts/icu-grammar.json";
import type { I18nError } from "../../src/errors";
import { createI18n } from "../../src/instance";

interface Case {
  message: string;
  note?: string;
  render: string | null;
  error: "syntax" | null;
  unclosed: number;
}

/** A long row (the depth rows) is named by its note. */
const cases = (grammar.cases as Case[]).map(
  (c) => [c.message.length > 60 ? c.note! : c.message, c] as const,
);

/** `values` plus, for every tag-like name in the message, the contract's handler. */
function params(
  message: string,
): Record<string, string | number | ((kids: readonly unknown[]) => string)> {
  const p: ReturnType<typeof params> = { ...grammar.values };
  for (const [, name] of message.matchAll(/<\/?([A-Za-z][\w-]*)/g))
    p[name] = (kids: readonly unknown[]) => `[${name}:${kids.join("")}]`;
  return p;
}

function renderOnce(message: string) {
  const errors: I18nError[] = [];
  const i18n = createI18n({
    locale: "en",
    messages: { en: { k: message } },
    onError: (e) => errors.push(e),
  });
  const out = i18n.t("k", params(message));
  return { i18n, out, errors };
}

describe("contracts/icu-grammar.json in @comvi/core (development)", () => {
  it.each(cases)("%s → the contract's render and error", (_, c) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { out, errors } = renderOnce(c.message);

    expect({ out, errors: errors.map((e) => e.code) }).toEqual(
      c.error === null ? { out: c.render, errors: [] } : { out: "k", errors: [c.error] },
    );
  });

  it.each(cases)("%s → one never-closed warning per occurrence, at compile time only", (_, c) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { i18n } = renderOnce(c.message);
    const first = warn.mock.calls.filter(([m]) => /is never closed/.test(m)).length;
    i18n.t("k", params(c.message));

    expect([first, warn.mock.calls.filter(([m]) => /is never closed/.test(m)).length]).toEqual([
      c.unclosed,
      c.unclosed,
    ]);
  });
});
