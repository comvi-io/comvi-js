// Plan §2.4 — the JS-consumer contract for the four members that LEFT
// `useI18n()` in 0.5.0.
//
// Deliberately .jsx, not .tsx: a TypeScript file would fail to compile on
// every shape below, which proves nothing about what a JavaScript consumer
// experiences at runtime. Run by BOTH the `js-contract-dev` and
// `js-contract-prod` vitest projects, which pin `@comvi/core*` to the dev and
// prod build family respectively (vitest.config.ts).
import { describe, it, expect } from "vitest";
import { renderHook } from "@solidjs/testing-library";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { I18nProvider } from "../../src/context";
import { useI18n } from "../../src/useI18n";

const wrapperFor = (i18n) =>
  function Wrapper(props) {
    return (
      <I18nProvider i18n={i18n} autoInit={false}>
        {props.children}
      </I18nProvider>
    );
  };

const baseHost = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: { en: { greeting: "Hello" } },
  });

const composedHost = () => attachPlugins(attachLoader(baseHost()));

// A capability-CARRYING host must behave exactly like the base one here: the
// members are gone from `useI18n()` by absence, not by host sniffing.
describe.each([
  ["base host", baseHost],
  ["base + attachLoader + attachPlugins", composedHost],
])("useI18n() capability-member absence (%s)", (_label, makeHost) => {
  const render = () => renderHook(useI18n, { wrapper: wrapperFor(makeHost()) });

  it("pure destructure yields undefined and calling it is a TypeError", () => {
    const { reloadTranslations } = render().result;

    expect(reloadTranslations).toBeUndefined();
    expect(() => reloadTranslations()).toThrow(TypeError);
  });

  it("mixed destructure keeps the common members working", () => {
    const { t, onMissingKey } = render().result;

    expect(t("greeting")).toBe("Hello");
    expect(onMissingKey).toBeUndefined();
  });

  it("aliased destructure yields undefined", () => {
    const { reloadTranslations: r, addActiveNamespace: addNs } = render().result;

    expect(r).toBeUndefined();
    expect(addNs).toBeUndefined();
  });

  it("property access yields undefined", () => {
    const api = render().result;

    expect(api.onLoadError).toBeUndefined();
    expect(api.onMissingKey).toBeUndefined();
    expect(api.reloadTranslations).toBeUndefined();
    expect(api.addActiveNamespace).toBeUndefined();
  });

  it("does not carry the members as own or inherited keys", () => {
    const api = render().result;

    for (const name of [
      "addActiveNamespace",
      "reloadTranslations",
      "onLoadError",
      "onMissingKey",
    ]) {
      expect(name in api).toBe(false);
    }
  });
});
