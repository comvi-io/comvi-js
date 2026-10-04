import { describe, it, expect } from "vitest";
import { I18n } from "../helpers/composedHost";
import { prepareTranslation } from "../../src/core/prepareTranslation";
import type { TranslationResult } from "../../src";

/**
 * `#` binds to the count of the plural that encloses it. A branch that has to
 * be re-parsed (it holds `{`, `<` or `'`) now reaches the parser with its `#`
 * intact, as a token the renderer resolves against the current count — the
 * count is no longer substituted into the branch text before parsing, which
 * used to key one template-cache entry per distinct count.
 *
 * Only the counting claim in `hot-path-invariants.test.ts` was red on the old
 * code; every case here is a regression guard on the rendered output, which
 * the change had to preserve exactly.
 */
function render(template: string, params: Record<string, unknown>): TranslationResult {
  const i18n = new I18n({ locale: "en" });
  i18n.addMessages({ en: { msg: template } });
  return i18n.t("msg", params as never);
}

describe("# inside a plural branch that is re-parsed", () => {
  it("resolves to the enclosing count when the branch also holds a parameter", () => {
    expect(render("{n, plural, other {# of {total} messages}}", { n: 3, total: 99 })).toBe(
      "3 of 99 messages",
    );
  });

  it("restores the outer count after a nested plural rebinds it", () => {
    expect(render("{n, plural, other {# and {m, plural, other {#}} and #}}", { n: 3, m: 5 })).toBe(
      "3 and 5 and 3",
    );
  });

  it("leaves a # that arrives inside a parameter value alone", () => {
    expect(render("{n, plural, other {# by {author}}}", { n: 3, author: "#1 fan" })).toBe(
      "3 by #1 fan",
    );
  });

  it("keeps a quoted '#' literal while resolving the unquoted one", () => {
    expect(render("{n, plural, other {'#' is #}}", { n: 3 })).toBe("# is 3");
  });

  it("resolves a # nested inside a tag", () => {
    const i18n = new I18n({ locale: "en" });
    i18n.addMessages({ en: { rich: "{n, plural, other {<b>#</b> messages}}" } });

    const content = prepareTranslation(i18n, {
      i18nKey: "rich",
      params: { n: 7 },
      components: { b: "strong" },
    }).content;

    expect(content).toEqual([
      { type: "element", tag: "strong", props: {}, children: ["7"] },
      " messages",
    ]);
  });
});

describe("# inside a plural branch that is not re-parsed", () => {
  it("resolves to the count on the text-only fast path", () => {
    expect(render("{n, plural, one {# item} other {# items}}", { n: 4 })).toBe("4 items");
  });

  it("resolves every # when a text-only branch holds more than one", () => {
    // The fast path special-cases the single-`#` shape; two of them take the
    // general substitution, and both must resolve to the same count.
    expect(render("{n, plural, other {# of # items}}", { n: 4 })).toBe("4 of 4 items");
  });

  it("resolves a # that is not the branch's first character", () => {
    // Guards the early bail in `replaceTopLevelHash`: it must compare the found
    // index against -1, not against a position a `#` can really occupy.
    expect(render("{n, plural, other {\u2248# items}}", { n: 4 })).toBe("\u22484 items");
  });

  it("leaves a text-only branch with no # untouched", () => {
    expect(render("{n, plural, one {one item} other {many items}}", { n: 4 })).toBe("many items");
  });

  it("stays literal at the top level, where # is not syntax", () => {
    expect(render("issue #{n}", { n: 4 })).toBe("issue #4");
  });
});
