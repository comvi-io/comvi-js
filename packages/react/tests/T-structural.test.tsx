/**
 * Structural-render contract for `<T>` against REAL `@comvi/core` (no
 * FakeI18n): tag parsing, the per-call extension channel, missing-param
 * semantics, and opaque React handlers round-tripping through the
 * `__comvi_handler_<name>__` marker transport.
 *
 * The fallback-parity fixture below is the same table as the svelte/vue/solid
 * wrappers — source of truth packages/svelte/tests/T-structural.test.ts, keep
 * the four in sync.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createI18n } from "../src/index";
import React from "react";
import { render } from "@testing-library/react";
import { I18nProvider } from "../src/I18nProvider";
import { T } from "../src/T";

export const WRAPPER_PARITY_FIXTURE = {
  translations: {
    plain: "Hello world",
    param: "Hello {name}!",
    tag: "Click <link>here</link> now",
    nested: "Read <outer>the <inner>fine</inner> print</outer>.",
    "missing-param": "Hi {name}",
  },
  cases: [
    { key: "plain", params: {}, components: {}, text: "Hello world" },
    { key: "param", params: { name: "Ada" }, components: {}, text: "Hello Ada!" },
    { key: "tag", params: {}, components: { link: "a" }, text: "Click here now" },
    {
      key: "nested",
      params: {},
      components: { outer: "strong", inner: "em" },
      text: "Read the fine print.",
    },
    // Core's default `missingParam: "literal"` renders the placeholder as-is.
    { key: "missing-param", params: {}, components: {}, text: "Hi {name}" },
  ],
} as const;

const makeI18n = async (translations: Record<string, string>) => {
  const i18n = createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: { en: translations },
  });
  await i18n.init();
  return i18n;
};

describe("<T /> structural render (real core)", () => {
  it("invokes a React component handler with the tag content as children", async () => {
    const i18n = await makeI18n({ earned: "You earned <badge>gold</badge>!" });

    const { container } = render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <T
          i18nKey={"earned" as never}
          components={{
            badge: ({ children }: { children: React.ReactNode }) => (
              <mark data-testid="badge">{children}</mark>
            ),
          }}
        />
      </I18nProvider>,
    );

    const badge = container.querySelector('[data-testid="badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.tagName.toLowerCase()).toBe("mark");
    expect(badge!.textContent).toBe("gold");
    expect(container.textContent).toBe("You earned gold!");
  });

  // The host is the BASE one, with no tag syntax of its own: these rows pass
  // only because `prepareTranslation` passes the tag extension per call. Every
  // row must produce byte-identical text to the svelte/vue/solid wrappers.
  describe("fallback-parity fixture (shared with svelte/vue/solid)", () => {
    let i18n: Awaited<ReturnType<typeof makeI18n>>;

    beforeAll(async () => {
      i18n = await makeI18n({ ...WRAPPER_PARITY_FIXTURE.translations });
    });

    for (const parityCase of WRAPPER_PARITY_FIXTURE.cases) {
      it(`produces the shared text for "${parityCase.key}"`, () => {
        const { container } = render(
          <I18nProvider i18n={i18n} autoInit={false}>
            <T
              i18nKey={parityCase.key as never}
              params={{ ...parityCase.params }}
              components={{ ...parityCase.components }}
            />
          </I18nProvider>,
        );

        expect(container.textContent).toBe(parityCase.text);
      });
    }
  });
});
