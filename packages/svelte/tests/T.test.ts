import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import TFallbackWrapper from "./TFallback.test.svelte";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import type { TranslationResult } from "@comvi/core";

const createFallbackI18n = (): FakeI18n => {
  const fake = new FakeI18n({ language: "en", defaultNamespace: "default" });
  fake.addTranslations({ en: { existing: "Existing Translation" } });
  fake.tImplementation = (key, params): TranslationResult => {
    if (key === "missing.with.handler") {
      return "Handler Fallback";
    }
    const value = fake.translationCache.getInternalMap().get(`${fake.language}:default`)?.[key] as
      | string
      | undefined;
    return value ?? params?.fallback ?? key;
  };
  return fake;
};

describe("T.svelte fallback contract", () => {
  let fake: FakeI18n;
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    fake = createFallbackI18n();
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
    component = mount(TFallbackWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "existing", useSlot: true },
    });

    expect(target.innerHTML).toContain("Existing Translation");
    expect(target.innerHTML).not.toContain("Slot fallback");
  });

  it("renders fallback prop when key is missing", () => {
    component = mount(TFallbackWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "missing",
        fallbackProp: "Prop Fallback",
        useSlot: false,
      },
    });

    expect(target.innerHTML).toContain("Prop Fallback");
  });

  it("prefers fallback prop over slot when both are provided", () => {
    component = mount(TFallbackWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "missing",
        fallbackProp: "Prop Fallback",
        useSlot: true,
      },
    });

    expect(target.innerHTML).toContain("Prop Fallback");
    expect(target.innerHTML).not.toContain("Slot fallback");
  });

  it("renders missing-key handler result", () => {
    component = mount(TFallbackWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "missing.with.handler", useSlot: false },
    });

    expect(target.innerHTML).toContain("Handler Fallback");
  });

  it("renders missing-key handler result even when slot is provided", () => {
    component = mount(TFallbackWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "missing.with.handler", useSlot: true },
    });

    expect(target.innerHTML).toContain("Handler Fallback");
    expect(target.innerHTML).not.toContain("Slot fallback");
  });

  it("renders slot when translation is unresolved and no fallback prop is provided", () => {
    component = mount(TFallbackWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "missing.key", useSlot: true },
    });

    expect(target.innerHTML).toContain("<span>Slot fallback</span>");
    expect(target.innerHTML).not.toContain("missing.key");
  });

  it("renders key when no fallback mechanism exists", () => {
    component = mount(TFallbackWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "missing.key", useSlot: false },
    });

    expect(target.innerHTML).toContain("missing.key");
  });

  it("re-renders when language changes through i18n events", async () => {
    fake.addTranslations({
      en: { existing: "Hello World" },
      fr: { existing: "Bonjour le Monde" },
    });

    component = mount(TFallbackWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "existing", useSlot: false },
    });

    expect(target.innerHTML).toContain("Hello World");

    await fake.setLanguageAsync("fr");
    await tick();

    expect(target.innerHTML).toContain("Bonjour le Monde");
  });
});
