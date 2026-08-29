/**
 * T.svelte's fallback chain — prop, children snippet, missing-key handler,
 * bare key — against the REAL `@comvi/core` resolution. A double that
 * re-implements `value ?? params.fallback ?? key` would assert itself here,
 * not the component.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import TFallbackWrapper from "./TFallback.test.svelte";
import { attachPlugins, createI18n } from "../src/index";

const makeI18n = (translations: Record<string, Record<string, string>>) =>
  createI18n({ locale: "en", exposeGlobal: false, translation: translations });

// `onMissingKey` is a plugin-host member, so the handler cases compose that
// capability rather than using the base preset.
const makeHandlerI18n = (translations: Record<string, Record<string, string>>) => {
  const i18n = createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: translations,
  }).with(attachPlugins);
  i18n.onMissingKey(() => "Handler Fallback");
  return i18n;
};

describe("T.svelte fallback contract", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  const rendered = () => target.querySelector('[data-testid="t-wrapper"]')?.textContent ?? null;

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

  it("renders existing translation normally", () => {
    const i18n = makeI18n({ en: { existing: "Existing Translation" } });

    component = mount(TFallbackWrapper, {
      target,
      props: { i18n, i18nKey: "existing", useSlot: true },
    });

    expect(rendered()).toBe("Existing Translation");
  });

  it("renders fallback prop when key is missing", () => {
    const i18n = makeI18n({ en: { existing: "Existing Translation" } });

    component = mount(TFallbackWrapper, {
      target,
      props: {
        i18n,
        i18nKey: "missing",
        fallbackProp: "Prop Fallback",
        useSlot: false,
      },
    });

    expect(rendered()).toBe("Prop Fallback");
  });

  it("prefers fallback prop over slot when both are provided", () => {
    const i18n = makeI18n({ en: { existing: "Existing Translation" } });

    component = mount(TFallbackWrapper, {
      target,
      props: {
        i18n,
        i18nKey: "missing",
        fallbackProp: "Prop Fallback",
        useSlot: true,
      },
    });

    expect(rendered()).toBe("Prop Fallback");
    expect(target.querySelector("span")).toBeNull();
  });

  it("renders missing-key handler result", () => {
    const i18n = makeHandlerI18n({ en: { existing: "Existing Translation" } });

    component = mount(TFallbackWrapper, {
      target,
      props: { i18n, i18nKey: "missing.with.handler", useSlot: false },
    });

    expect(rendered()).toBe("Handler Fallback");
  });

  it("renders missing-key handler result even when slot is provided", () => {
    const i18n = makeHandlerI18n({ en: { existing: "Existing Translation" } });

    component = mount(TFallbackWrapper, {
      target,
      props: { i18n, i18nKey: "missing.with.handler", useSlot: true },
    });

    expect(rendered()).toBe("Handler Fallback");
    expect(target.querySelector("span")).toBeNull();
  });

  it("renders slot when translation is unresolved and no fallback prop is provided", () => {
    const i18n = makeI18n({ en: { existing: "Existing Translation" } });

    component = mount(TFallbackWrapper, {
      target,
      props: { i18n, i18nKey: "missing.key", useSlot: true },
    });

    expect(target.querySelector("span")?.textContent).toBe("Slot fallback");
    expect(rendered()).toBe("Slot fallback");
  });

  it("renders key when no fallback mechanism exists", () => {
    const i18n = makeI18n({ en: { existing: "Existing Translation" } });

    component = mount(TFallbackWrapper, {
      target,
      props: { i18n, i18nKey: "missing.key", useSlot: false },
    });

    expect(rendered()).toBe("missing.key");
  });

  it("re-renders when language changes through i18n events", async () => {
    const i18n = makeI18n({
      en: { existing: "Hello World" },
      fr: { existing: "Bonjour le Monde" },
    });

    component = mount(TFallbackWrapper, {
      target,
      props: { i18n, i18nKey: "existing", useSlot: false },
    });

    expect(rendered()).toBe("Hello World");

    await i18n.setLocaleAsync("fr");
    await tick();

    expect(rendered()).toBe("Bonjour le Monde");
  });
});
