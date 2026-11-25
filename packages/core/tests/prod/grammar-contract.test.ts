/**
 * contracts/icu-grammar.json in the production build (`__DEV__` false, B12): a message with
 * a never-closed tag is valid text and gives no signal at all — no warning, no `onError`;
 * a message that does not compile renders its key and reports `syntax` with no message.
 */
import { describe, expect, it, vi } from "vitest";
import type { I18nError } from "../../src/errors";
import { createI18n } from "../../src/instance";
import { grammarCases } from "../grammar";

describe("contracts/icu-grammar.json in @comvi/core (production)", () => {
  it.each(grammarCases())("%s → the contract's render; nothing printed", (_, c) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errors: I18nError[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: { k: c.message } },
      onError: (e) => errors.push(e),
    });

    const out = i18n.t("k", c.params);

    expect({ out, errors }).toEqual(
      c.error === null
        ? { out: c.render, errors: [] }
        : { out: "k", errors: [{ code: c.error, key: "k", locale: "en", message: undefined }] },
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
