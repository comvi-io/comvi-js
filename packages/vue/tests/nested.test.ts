/**
 * Nested catalogs through the binding (lot 6a, D1): the core normalizes at its entry; the
 * binding has no rule of its own. A nested `messages` literal type-checks as written.
 */
import { defineComponent, h } from "vue";
import { describe, expect, it } from "vitest";
import { createI18n, T, useI18n } from "../src";
import { mountWith } from "./helpers";

describe("a nested catalog in Vue", () => {
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
    const C = defineComponent({
      setup() {
        const { t } = useI18n();
        return () =>
          h("p", [
            t("account.greeting", { name: "Ann" }),
            " ",
            t("account.items", { count: 2 }),
            " ",
            h(T, { i18nKey: "account.terms", components: { b: "strong" } }),
          ]);
      },
    });
    expect(mountWith(i18n, C).html()).toBe(
      "<p>Hi, Ann! 2 items Read the <strong>terms</strong>.</p>",
    );
  });
});
