/**
 * `<T>` accepts interpolation params as direct props, the way `@comvi/react`
 * already does (`packages/react/src/T.tsx` spreads its rest props into the
 * params bag). Declared props keep their own meaning and never become params.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import TDirectPropsWrapper from "./TDirectProps.test.svelte";
import TDirectPropsReactiveWrapper from "./TDirectPropsReactive.test.svelte";
import { createI18n } from "../src/index";

const makeI18n = (messages: Record<string, Record<string, string>>) =>
  createI18n({ locale: "en", exposeGlobal: false, messages });

describe("T.svelte direct-prop params", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  const rendered = () =>
    target.querySelector('[data-testid="t-direct-props"]')?.textContent ?? null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = null;
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    target.remove();
  });

  it("direct prop → interpolated as a param", () => {
    const i18n = makeI18n({ en: { greet: "Hello {name}" } });

    component = mount(TDirectPropsWrapper, {
      target,
      props: { i18n, i18nKey: "greet", direct: { name: "Ada" } },
    });

    expect(rendered()).toBe("Hello Ada");
  });

  it("direct prop colliding with a `params` entry → the direct prop wins", () => {
    const i18n = makeI18n({ en: { greet: "Hello {name}" } });

    component = mount(TDirectPropsWrapper, {
      target,
      props: {
        i18n,
        i18nKey: "greet",
        params: { name: "From params" },
        direct: { name: "From prop" },
      },
    });

    expect(rendered()).toBe("Hello From prop");
  });

  it("`params` entry with no direct prop of that name → still interpolated", () => {
    const i18n = makeI18n({ en: { order: "{count} for {name}" } });

    component = mount(TDirectPropsWrapper, {
      target,
      props: { i18n, i18nKey: "order", params: { count: 2 }, direct: { name: "Ada" } },
    });

    expect(rendered()).toBe("2 for Ada");
  });

  it("declared `components` prop → not interpolated as a param", () => {
    const i18n = makeI18n({ en: { probe: "A {components} B" } });

    component = mount(TDirectPropsWrapper, {
      target,
      props: { i18n, i18nKey: "probe", direct: { components: { bold: "strong" } } },
    });

    expect(rendered()).toBe("A {components} B");
  });

  it("declared `locale` prop → selects the locale, never interpolated as a param", () => {
    const i18n = makeI18n({
      en: { probe: "English {name}" },
      fr: { probe: "Français {name}" },
    });

    component = mount(TDirectPropsWrapper, {
      target,
      props: { i18n, i18nKey: "probe", direct: { locale: "fr", name: "Ada" } },
    });

    expect(rendered()).toBe("Français Ada");
  });

  it("direct prop whose value changes → re-renders with the new value", async () => {
    const i18n = makeI18n({ en: { greet: "Hello {name}" } });
    component = mount(TDirectPropsReactiveWrapper, { target, props: { i18n } });
    const rename = target.querySelector<HTMLButtonElement>('[data-testid="rename"]');

    rename?.click();
    await tick();

    expect(target.querySelector('[data-testid="t-reactive"]')?.textContent).toBe("Hello Bo");
  });

  it("no direct props → `params` alone is interpolated", () => {
    const i18n = makeI18n({ en: { greet: "Hello {name}" } });

    component = mount(TDirectPropsWrapper, {
      target,
      props: { i18n, i18nKey: "greet", params: { name: "Ada" } },
    });

    expect(rendered()).toBe("Hello Ada");
  });
});
