import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import ContextHarness from "./ContextHarness.test.svelte";

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

  it("provides context to descendant components", async () => {
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({
      en: { hello: "Hello" },
      fr: { hello: "Bonjour" },
    });

    component = mount(ContextHarness, {
      target,
      props: { i18n: fake.asI18n(), autoInit: false },
    });

    expect(text("context-language")).toBe("en");
    expect(text("hook")).toBe("Hello-en");
    expect(text("component")).toContain("Hello");

    await fake.setLanguageAsync("fr");
    await tick();

    expect(text("context-language")).toBe("fr");
    expect(text("hook")).toBe("Bonjour-fr");
    expect(text("component")).toContain("Bonjour");
  });

  it("auto-initializes descendants by default", async () => {
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({ en: { hello: "Hello" } });

    component = mount(ContextHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    expect(text("initialized")).toBe("no");

    await Promise.resolve();
    await tick();

    expect(text("initialized")).toBe("yes");
  });

  it("allows manual initialization when autoInit is disabled", async () => {
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({ en: { hello: "Hello" } });

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
