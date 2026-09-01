import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import UseI18nHarness from "./UseI18nHarness.test.svelte";
import NoContextHarness from "./NoContextHarness.test.svelte";
import StoreCacheHarness from "./StoreCacheHarness.test.svelte";
import TranslationCacheHarness from "./TranslationCacheHarness.test.svelte";

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
    expect(text("default-formality")).toBe("none");
  });

  it("exposes reactive defaultParams and setDefaultParams", async () => {
    component = mount(UseI18nHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    click("set-default-params");
    await tick();

    expect(fake.setDefaultParams).toHaveBeenCalledWith({ formality: "formal" });
    expect(text("default-formality")).toBe("formal");
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

    // The harness pins `timeZone: "UTC"` on the date, so every literal below
    // is a function of the locale alone. NBSPs are escaped on purpose.
    expect([text("number"), text("currency"), text("date"), text("relative")]).toEqual([
      "1,234.5",
      "$99.99",
      "01/02/2024",
      "2 days ago",
    ]);

    click("switch-fr");
    await tick();

    expect(text("hello")).toBe("Bonjour");
    expect(text("language")).toBe("fr");
    expect(text("dir")).toBe("ltr");
    expect([text("number"), text("currency"), text("date"), text("relative")]).toEqual([
      "1\u202f234,5",
      "99,99\u00a0$US",
      "02/01/2024",
      "il y a 2 jours",
    ]);

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

    await vi.waitFor(() => {
      expect(text("loading")).toBe("false");
    });

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

  it("exposes the host's translation cache map, keyed by locale:namespace", () => {
    component = mount(TranslationCacheHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    expect(text("cache-keys")).toBe("ar:admin,ar:common,en:admin,en:common,fr:admin,fr:common");
    expect(text("cache-en-hello")).toBe("Hello");
  });

  it("hands repeated calls on one instance the same t and tRaw stores", () => {
    component = mount(StoreCacheHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    expect([text("t-stable"), text("traw-stable")]).toEqual(["true", "true"]);
  });

  it("keeps namespaces apart — each useI18n(ns) translates in its own namespace", () => {
    fake.addTranslations({ "en:billing": { title: "Billing" } });

    component = mount(StoreCacheHarness, {
      target,
      props: { i18n: fake.asI18n() },
    });

    expect([text("admin-title"), text("billing-title")]).toEqual(["Admin", "Billing"]);
    expect([text("admin-title-raw"), text("billing-title-raw")]).toEqual(["Admin", "Billing"]);
  });

  it("throws when called with no i18n context in the tree", () => {
    expect(() => mount(NoContextHarness, { target })).toThrow(
      "[@comvi/svelte] i18n context not found. " +
        "Call setI18nContext(i18n) in your root component (e.g., App.svelte).",
    );
  });
});
