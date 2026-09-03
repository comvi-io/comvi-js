/**
 * `<T>` accepts interpolation params as direct props, the way `@comvi/react`
 * already does (`packages/react/src/T.tsx` spreads its rest props into the
 * params bag). Declared props keep their own meaning and never become params.
 */
import { describe, it, expect } from "vitest";
import { createSignal, type JSX } from "solid-js";
import { createI18n } from "../src/index";
import { I18nProvider } from "../src/context";
import { T } from "../src/T";
import { renderSolid } from "./test-utils";

const makeI18n = (translation: Record<string, Record<string, string>>) =>
  createI18n({ locale: "en", exposeGlobal: false, translation });

const renderWithProvider = (i18n: ReturnType<typeof makeI18n>, ui: () => JSX.Element) =>
  renderSolid(() => (
    <I18nProvider i18n={i18n} autoInit={false}>
      {ui()}
    </I18nProvider>
  ));

describe("<T /> direct-prop params", () => {
  it("direct prop → interpolated as a param", () => {
    const i18n = makeI18n({ en: { greet: "Hello {name}" } });

    const container = renderWithProvider(i18n, () => <T i18nKey={"greet" as never} name="Ada" />);

    expect(container.textContent).toBe("Hello Ada");
  });

  it("direct prop colliding with a `params` entry → the direct prop wins", () => {
    const i18n = makeI18n({ en: { greet: "Hello {name}" } });

    const container = renderWithProvider(i18n, () => (
      <T i18nKey={"greet" as never} params={{ name: "From params" }} name="From prop" />
    ));

    expect(container.textContent).toBe("Hello From prop");
  });

  it("`params` entry with no direct prop of that name → still interpolated", () => {
    const i18n = makeI18n({ en: { order: "{count} for {name}" } });

    const container = renderWithProvider(i18n, () => (
      <T i18nKey={"order" as never} params={{ count: 2 }} name="Ada" />
    ));

    expect(container.textContent).toBe("2 for Ada");
  });

  it("declared `components` prop → not interpolated as a param", () => {
    const i18n = makeI18n({ en: { probe: "A {components} B" } });

    const container = renderWithProvider(i18n, () => (
      <T i18nKey={"probe" as never} components={{ bold: "strong" }} />
    ));

    expect(container.textContent).toBe("A {components} B");
  });

  it("declared `locale` prop → selects the locale, never interpolated as a param", () => {
    const i18n = makeI18n({
      en: { probe: "English {name}" },
      fr: { probe: "Français {name}" },
    });

    const container = renderWithProvider(i18n, () => (
      <T i18nKey={"probe" as never} locale="fr" name="Ada" />
    ));

    expect(container.textContent).toBe("Français Ada");
  });

  it("direct prop whose value changes → re-renders with the new value", () => {
    const i18n = makeI18n({ en: { greet: "Hello {name}" } });
    const [name, setName] = createSignal("Ada");
    const container = renderWithProvider(i18n, () => (
      <T i18nKey={"greet" as never} name={name()} />
    ));

    setName("Bo");

    expect(container.textContent).toBe("Hello Bo");
  });
});
