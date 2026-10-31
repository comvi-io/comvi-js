/**
 * The production arms (`__DEV__` false), at source level: `useI18n()` outside a provider still
 * fails, with no diagnostic text shipped, and the same app renders the same markup as in
 * development.
 */
import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nProvider, T, useI18n } from "../../src";

describe("production", () => {
  it("useI18n() outside a provider throws, without the development message", () => {
    const C = () => (useI18n(), null);
    let message = "";
    try {
      render(() => <C />);
    } catch (e) {
      message = String(e);
    }
    expect(message).toMatch(/TypeError/);
    expect(message).not.toContain("[@comvi/solid]");
  });

  it("renders the development markup: rich text, plural, a void element, a tag without handler", () => {
    const warn = vi.spyOn(console, "warn");
    const i18n = createI18n({
      locale: "en",
      messages: { en: { m: "<b>{n, plural, one {# item} other {# items}}</b><br/> <i>x</i>" } },
    });
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <T i18nKey="m" n={2} components={{ br: "br" }} b={(c) => <b>{c}</b>} />
      </I18nProvider>
    ));
    expect(container.innerHTML).toBe("<b>2 items</b><br> x");
    expect(warn).not.toHaveBeenCalled();
  });
});
