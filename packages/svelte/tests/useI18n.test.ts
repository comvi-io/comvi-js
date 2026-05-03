import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import UseI18nHarness from "./UseI18nHarness.test.svelte";

describe("useI18n", () => {
  let fake: FakeI18n;
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({
      en: { hello: "Hello", goodbye: "Bye" },
      "en:admin": { title: "Admin" },
      fr: { hello: "Bonjour", goodbye: "Au revoir" },
      "fr:admin": { title: "Administrateur" },
      ar: { hello: "مرحبا", goodbye: "مع السلامة" },
      "ar:admin": { title: "المشرف" },
    });
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

  function click(testId: string): void {
    (target.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null)?.click();
  }

  it("renders translations and public metadata from the hook API", () => {
    component = mount(UseI18nHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    expect(text("hello")).toBe("Hello");
    expect(text("admin-title")).toBe("Admin");
    expect(text("admin-common")).toBe("Hello");
    expect(text("language")).toBe("en");
    expect(text("dir")).toBe("ltr");
    expect(text("default-namespace")).toBe("common");
    expect(text("has-french")).toBe("true");
    expect(text("has-admin-title")).toBe("true");
    expect(text("loaded-languages")).toBe("ar,en,fr");
    expect(text("active-namespaces")).toBe("common");
  });

  it("returns plain text from $t and structured content from $tRaw", () => {
    fake.tImplementation = (key) => {
      if (key === "hello") {
        return ["Hello ", { type: "element", tag: "strong", props: {}, children: ["Alice"] }, "!"];
      }
      return key;
    };

    component = mount(UseI18nHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    expect(text("hello")).toBe("Hello Alice!");
    expect(text("raw-structured")).toBe("true");
  });

  it("updates translations, direction, and formatting when language changes through the hook", async () => {
    component = mount(UseI18nHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    const initialNumber = text("number");
    const initialCurrency = text("currency");
    const initialDate = text("date");
    const initialRelative = text("relative");

    click("switch-fr");
    await tick();

    expect(text("hello")).toBe("Bonjour");
    expect(text("language")).toBe("fr");
    expect(text("dir")).toBe("ltr");
    expect(text("number")).not.toBe(initialNumber);
    expect(text("currency")).not.toBe(initialCurrency);
    expect(text("date")).not.toBe(initialDate);
    expect(text("relative")).not.toBe(initialRelative);

    click("switch-ar");
    await tick();

    expect(text("hello")).toBe("مرحبا");
    expect(text("language")).toBe("ar");
    expect(text("dir")).toBe("rtl");
  });

  it("reflects loading and namespace state while addActiveNamespace is in flight", async () => {
    let resolveLoad: (() => void) | undefined;
    fake.namespaceLoadResult = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });

    component = mount(UseI18nHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    click("load-admin");
    await tick();

    expect(text("loading")).toBe("true");
    expect(text("active-namespaces")).toBe("admin,common");

    resolveLoad?.();
    await Promise.resolve();
    await tick();

    expect(text("loading")).toBe("false");
    expect(text("active-namespaces")).toBe("admin,common");
  });

  it("reflects cache updates through addTranslations and clearTranslations", async () => {
    component = mount(UseI18nHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    const before = Number(text("cache-revision"));

    expect(text("dynamic")).toBe("dynamic");

    click("add-dynamic");
    await tick();

    const afterAdd = Number(text("cache-revision"));
    expect(afterAdd).toBeGreaterThan(before);
    expect(text("dynamic")).toBe("Dynamic");

    click("clear-common-en");
    await tick();

    const afterClear = Number(text("cache-revision"));
    expect(afterClear).toBeGreaterThan(afterAdd);
    expect(text("hello")).toBe("hello");
  });

  it("stops event notifications after unsubscribing", async () => {
    component = mount(UseI18nHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    click("switch-fr");
    await tick();

    expect(text("events")).toBe("en->fr");

    click("unsubscribe-events");
    await tick();

    click("switch-ar");
    await tick();

    expect(text("events")).toBe("en->fr");
  });
});
