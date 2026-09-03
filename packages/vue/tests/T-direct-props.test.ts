/**
 * `<T>` accepts interpolation params as direct props, the way `@comvi/react`
 * already does (`packages/react/src/T.tsx` spreads its rest props into the
 * params bag). Declared props keep their own meaning and never become params.
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "../src/createI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

const mountT = (i18n: unknown, props: { i18nKey: string } & Record<string, unknown>) =>
  mount(T, {
    props,
    global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } },
  });

describe("<T /> direct-prop params", () => {
  it("direct prop → interpolated as a param", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greet: "Hello {name}" } },
    });

    const wrapper = mountT(i18n, { i18nKey: "greet", name: "Ada" });

    expect(wrapper.text()).toBe("Hello Ada");
  });

  it("direct prop colliding with a `params` entry → the direct prop wins", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greet: "Hello {name}" } },
    });

    const wrapper = mountT(i18n, {
      i18nKey: "greet",
      params: { name: "From params" },
      name: "From prop",
    });

    expect(wrapper.text()).toBe("Hello From prop");
  });

  it("`params` entry with no direct prop of that name → still interpolated", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { order: "{count} for {name}" } },
    });

    const wrapper = mountT(i18n, {
      i18nKey: "order",
      params: { count: 2 },
      name: "Ada",
    });

    expect(wrapper.text()).toBe("2 for Ada");
  });

  it("declared `components` prop → not interpolated as a param", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { probe: "A {components} B" } },
    });

    const wrapper = mountT(i18n, {
      i18nKey: "probe",
      components: { bold: "strong" },
    });

    expect(wrapper.text()).toBe("A {components} B");
  });

  it("declared `locale` prop → selects the locale, never interpolated as a param", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { probe: "English {name}" }, fr: { probe: "Français {name}" } },
    });

    const wrapper = mountT(i18n, { i18nKey: "probe", locale: "fr", name: "Ada" });

    expect(wrapper.text()).toBe("Français Ada");
  });

  it("no direct props → the `params` object is passed through untouched", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greet: "Hello {name}" } },
    });
    const params = { name: "Ada" };

    const wrapper = mountT(i18n, { i18nKey: "greet", params });

    expect(wrapper.text()).toBe("Hello Ada");
    expect(params).toEqual({ name: "Ada" });
  });
});
