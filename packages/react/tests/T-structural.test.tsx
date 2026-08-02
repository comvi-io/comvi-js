/**
 * Structural-render contract for the prepareTranslation-backed <T> (§4.3):
 *   - the component consumes the shared T-core pipeline against REAL
 *     @comvi/core (tag parsing, per-call extension channel, missing-param
 *     semantics exercised end to end — no FakeI18n);
 *   - opaque React handlers round-trip through the `__comvi_handler_<name>__`
 *     marker transport;
 *   - a fallback-parity fixture pins the same template + params table as the
 *     svelte/vue/solid wrappers (source of truth:
 *     packages/svelte/tests/T-structural.test.ts — keep in sync).
 */
import { describe, it, expect } from "vitest";
import { createI18n as createSlimI18n } from "@comvi/core/slim";
import React from "react";
import { render } from "@testing-library/react";
import { createI18n } from "../src";
import { I18nProvider } from "../src/I18nProvider";
import { T } from "../src/T";

// ---------------------------------------------------------------------------
// Shared fallback-parity fixture (same table as the svelte/vue wrappers)
// ---------------------------------------------------------------------------

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
    // missingParam: "literal" (core 0.5 default) — placeholder renders as itself
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

  describe("fallback-parity fixture (shared with svelte/vue/solid)", () => {
    for (const parityCase of WRAPPER_PARITY_FIXTURE.cases) {
      it(`produces the shared text for "${parityCase.key}"`, async () => {
        const i18n = await makeI18n({ ...WRAPPER_PARITY_FIXTURE.translations });

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

  // framework-slim P2: the same table on a BARE @comvi/core/slim host. <T>
  // does not depend on ambient tag registration — prepareTranslation passes
  // the tag extension per call (T.tsx:1-4) — so every row must produce
  // byte-identical text on a host that has no tag syntax of its own.
  describe("fallback-parity fixture on a bare-slim host", () => {
    for (const parityCase of WRAPPER_PARITY_FIXTURE.cases) {
      it(`produces the shared text for "${parityCase.key}"`, async () => {
        const i18n = createSlimI18n({
          locale: "en",
          exposeGlobal: false,
          translation: { en: { ...WRAPPER_PARITY_FIXTURE.translations } },
        });
        await i18n.init();

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
