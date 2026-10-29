/**
 * Lot 4b part B (owner brief 29.10): `<T components>` renders nested markup with the
 * precedence handler prop → `components` (a prop that is `undefined` does not override,
 * `null` does), and `t()` returns what its types say.
 */
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, T, useI18n } from "../src";
import { make } from "./helpers";

describe("<T components> (lot 4b, R3-24 in React)", () => {
  const Italic = ({ children }: { children?: ReactNode }) => <i className="it">{children}</i>;
  const messages = { en: { m: "Read <b>the <i>new</i> terms</b> <x>now</x>." } };

  it("renders nested tags by name: an HTML tag name or a component, the content as children", () => {
    const { i18n } = make({ locale: "en", messages });
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <T i18nKey="m" components={{ b: "strong", i: Italic }} />
      </I18nProvider>,
    );
    // `x` has neither a prop nor a component: its content renders as text.
    expect(container.innerHTML).toBe('Read <strong>the <i class="it">new</i> terms</strong> now.');
  });

  it("precedence: a handler prop, then components; an `undefined` prop does not override, `null` does", () => {
    const { i18n } = make({ locale: "en", messages, onError: () => {} });
    const html = (el: ReactNode) =>
      render(<I18nProvider i18n={i18n}>{el}</I18nProvider>).container.innerHTML;
    expect(
      html(
        <T i18nKey="m" components={{ b: "strong", i: "em" }} b={(c: ReactNode) => <u>{c}</u>} />,
      ),
    ).toBe("Read <u>the <em>new</em> terms</u> now.");
    expect(html(<T i18nKey="m" components={{ b: "strong", i: "em" }} b={undefined} />)).toBe(
      "Read <strong>the <em>new</em> terms</strong> now.",
    );
    // `null` is a value like any other: not a function, so the tag is unhandled (text).
    expect(html(<T i18nKey="m" components={{ b: "strong", i: "em" }} b={null} />)).toBe(
      "Read the <em>new</em> terms now.",
    );
  });

  it("the bound <T> takes components too; `components` is never a message param", () => {
    const { i18n } = make({
      locale: "en",
      catalogs: { shop: { en: { m: "<b>{components}</b>" } } },
      onError: () => {},
    });
    const Shop = () => {
      const { T: ShopT } = useI18n("shop");
      return <ShopT i18nKey="m" components={{ b: "strong" }} />;
    };
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Shop />
      </I18nProvider>,
    );
    expect(container.innerHTML).toBe("<strong>{components}</strong>");
  });

  it("a rich t() call returns an element, a text call a string (the honest types)", () => {
    const { i18n } = make({ locale: "en", messages: { en: { m: "<b>x</b>", s: "Hi {n}" } } });
    let rich: unknown;
    let text: unknown;
    const Probe = () => {
      const { t } = useI18n();
      rich = t("m", { b: (c) => <b>{c}</b> });
      text = t("s", { n: 1 });
      return null;
    };
    render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(typeof rich).toBe("object");
    expect(text).toBe("Hi 1");
  });
});
