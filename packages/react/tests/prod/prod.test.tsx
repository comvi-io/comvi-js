/**
 * The production arms (`__DEV__` false), at source level: a hook outside a provider still
 * fails (React's own TypeError, no diagnostic text shipped), and the same app renders the
 * same markup as in development — diagnostics never change what renders.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, T, useI18n } from "../../src";

describe("production", () => {
  it("a hook outside a provider throws, without the development message", () => {
    const Probe = () => <p>{useI18n().locale}</p>;
    vi.spyOn(console, "error").mockImplementation(() => {});
    let message = "";
    try {
      renderToStaticMarkup(<Probe />);
    } catch (e) {
      message = String(e);
    }
    expect(message).toMatch(/TypeError/);
    expect(message).not.toContain("[@comvi/react]");
  });

  it("renders the development markup: rich text, plural, handover, a tag without handler", () => {
    const warn = vi.spyOn(console, "warn");
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: { m: "<b>{n, plural, one {# item} other {# items}}</b> <i>x</i>" },
        de: { m: "<b>{n} Artikel</b>" },
      },
    });
    const out = renderToStaticMarkup(
      <I18nProvider i18n={i18n}>
        <T i18nKey="m" n={2} b={(c: ReactNode) => <b>{c}</b>} />|
        <I18nHandover locale="de">
          <T i18nKey="m" n={3} b={(c: ReactNode) => <b>{c}</b>} />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(out).toBe("<b>2 items</b> x|<b>3 Artikel</b>");
    expect(warn).not.toHaveBeenCalled();
  });
});
