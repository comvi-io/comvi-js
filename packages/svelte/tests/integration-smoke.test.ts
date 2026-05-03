import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import { createI18n } from "@comvi/core";
import IntegrationSmoke from "./IntegrationSmoke.test.svelte";

describe("svelte integration smoke", () => {
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

  it("wires context, useI18n, and <T> with real core instance", async () => {
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        en: { hello: "Hello" },
        fr: { hello: "Bonjour" },
      },
    });

    await i18n.init();

    component = mount(IntegrationSmoke, {
      target,
      props: { i18n },
    });

    expect(target.textContent).toContain("Hello-en");

    await i18n.setLocaleAsync("fr");
    await tick();

    expect(target.textContent).toContain("Bonjour-fr");
  });
});
