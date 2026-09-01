import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import ContextHarness from "./ContextHarness.test.svelte";
import EagerInitHarness from "./EagerInitHarness.test.svelte";

describe("svelte context", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

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

  function text(testId: string): string {
    return target.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
  }

  let fake: FakeI18n;

  beforeEach(() => {
    fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({
      en: { hello: "Hello" },
      fr: { hello: "Bonjour" },
    });
  });

  it("provides context to descendant components", async () => {
    component = mount(ContextHarness, {
      target,
      props: { i18n: fake.asI18n(), autoInit: false },
    });

    expect(text("context-language")).toBe("en");
    expect(text("hook")).toBe("Hello-en");
    expect(text("component")).toBe("Hello");

    await fake.setLanguageAsync("fr");
    await tick();

    expect(text("context-language")).toBe("fr");
    expect(text("hook")).toBe("Bonjour-fr");
    expect(text("component")).toBe("Bonjour");
  });

  it("auto-initializes descendants by default", async () => {
    component = mount(ContextHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    expect(text("initialized")).toBe("no");

    await vi.waitFor(() => {
      expect(text("initialized")).toBe("yes");
    });
  });

  it("skips its auto-init when the component starts init() first — no double init", async () => {
    component = mount(EagerInitHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    await vi.waitFor(() => {
      expect(fake.isInitialized).toBe(true);
    });

    expect(fake.init).toHaveBeenCalledTimes(1);
  });

  it("allows manual initialization when autoInit is disabled", async () => {
    component = mount(ContextHarness, {
      target,
      props: { i18n: fake.asI18n(), autoInit: false },
    });

    await Promise.resolve();
    await tick();

    expect(text("initialized")).toBe("no");

    await fake.init();
    await tick();

    expect(text("initialized")).toBe("yes");
  });
});
