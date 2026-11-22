/**
 * contracts/icu-grammar.json in the production build (`__DEV__` false, B12): a message with
 * a never-closed tag is valid text and gives no signal at all — no warning, no `onError`;
 * a message that does not compile renders its key and reports `syntax` with no message.
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
}

/** A long row (the depth rows) is named by its note. */
const cases = (grammar.cases as Case[]).map(
  (c) => [c.message.length > 60 ? c.note! : c.message, c] as const,
);

function params(
  message: string,
): Record<string, string | number | ((kids: readonly unknown[]) => string)> {
  const p: ReturnType<typeof params> = { ...grammar.values };
  for (const [, name] of message.matchAll(/<\/?([A-Za-z][\w-]*)/g))
    p[name] = (kids: readonly unknown[]) => `[${name}:${kids.join("")}]`;
  return p;
}

describe("contracts/icu-grammar.json in @comvi/core (production)", () => {
  it.each(cases)("%s → the contract's render; nothing printed", (_, c) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errors: I18nError[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: { k: c.message } },
      onError: (e) => errors.push(e),
    });

    const out = i18n.t("k", params(c.message));

    expect({ out, errors }).toEqual(
      c.error === null
        ? { out: c.render, errors: [] }
        : { out: "k", errors: [{ code: c.error, key: "k", locale: "en", message: undefined }] },
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
