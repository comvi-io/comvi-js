/**
 * Nested catalogs through the binding (lot 6a, D1): the core normalizes at its entry; the
 * binding has no rule of its own. A nested `messages` literal type-checks as written.
 */
import { describe, expect, it } from "vitest";
import { createI18n, useI18n } from "../src";
import { mountWith } from "./helpers";

describe("a nested catalog in Svelte", () => {
  it("t() reads its dotted keys: a param, a plural", () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: {
          account: {
            greeting: "Hi, {name}!",
            items: "{count, plural, one {# item} other {# items}}",
          },
        },
      },
    });
    let got!: ReturnType<typeof useI18n>;
    mountWith(i18n, () => void (got = useI18n()));
    expect([
      got.t("account.greeting", { name: "Ann" }),
      got.t("account.items", { count: 2 }),
    ]).toEqual(["Hi, Ann!", "2 items"]);
  });
});
