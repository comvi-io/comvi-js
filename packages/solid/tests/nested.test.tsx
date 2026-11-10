/**
 * Nested catalogs through the binding (lot 6a, D1): the core normalizes at its entry; the
 * binding has no rule of its own. A nested `messages` literal type-checks as written.
 */
import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { createI18n, I18nProvider, T, useI18n } from "../src";

describe("a nested catalog in Solid", () => {
  it("t() and <T> read its dotted keys: a param, a plural, rich text", () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: {
          account: {
            greeting: "Hi, {name}!",
            items: "{count, plural, one {# item} other {# items}}",
            terms: "Read the <b>terms</b>.",
          },
        },
      },
    });
    const App = () => {
      const { t } = useI18n();
      return (
        <p data-testid="p">
          {t("account.greeting", { name: "Ann" })} {t("account.items", { count: 2 })}{" "}
          <T i18nKey="account.terms" components={{ b: "strong" }} />
        </p>
      );
    };
    const { getByTestId } = render(() => (
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    ));
    expect(getByTestId("p").textContent).toBe("Hi, Ann! 2 items Read the terms.");
    expect(getByTestId("p").querySelector("strong")?.textContent).toBe("terms");
  });
});
