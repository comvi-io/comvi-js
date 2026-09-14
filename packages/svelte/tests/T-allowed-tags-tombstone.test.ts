/**
 * `allowedTags` left `<T>` in 0.5: `<T>` renders structurally now, so there is
 * no HTML-string sink left to allowlist tags for — tag handlers come from
 * `components` instead. `TBaseProps.allowedTags?: never` makes a TYPED
 * caller's use a compile error (`tests/types/t-direct-props.test-d.ts`); this
 * file characterizes the JS-caller fallback a type error cannot stop: the
 * prop must never reach `params` as an interpolation value, and must warn
 * once per host in development, independent of the `raw` dedupe
 * (`T-skip-post-process.test.ts` covers that one).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import TAllowedTagsTombstoneWrapper from "./TAllowedTagsTombstone.test.svelte";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { createI18n } from "../src/index";

const createFake = (): FakeI18n => {
  const fake = new FakeI18n({ language: "en", defaultNamespace: "default" });
  fake.addTranslations({ en: { probe: "x" } });
  return fake;
};

describe("T.svelte allowedTags tombstone — dropped, not forwarded", () => {
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

  it("does not forward allowedTags into the params tRaw receives", () => {
    const fake = createFake();
    component = mount(TAllowedTagsTombstoneWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "probe", allowedTags: ["b", "i"] },
    });

    expect(fake.tRaw).toHaveBeenCalledTimes(1);
    expect(Object.keys(fake.tRaw.mock.calls[0]![1] ?? {})).not.toContain("allowedTags");
  });

  it("an explicit params.allowedTags is untouched — only the PROP is a tombstone", () => {
    const fake = createFake();
    component = mount(TAllowedTagsTombstoneWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { allowedTags: ["b"] },
      },
    });

    // `allowedTags` here arrived through `params`, the same way any other
    // undeclared interpolation value would — the tombstone only intercepts
    // the direct PROP, matching the reserved-prop forwarding rule the other
    // four (`ns`/`locale`/`fallback`/`raw`) already follow.
    expect(fake.tRaw).toHaveBeenLastCalledWith(
      "probe",
      expect.objectContaining({ allowedTags: ["b"] }),
    );
  });

  it("other direct params still reach tRaw normally", () => {
    const fake = createFake();
    component = mount(TAllowedTagsTombstoneWrapper, {
      target,
      props: { i18n: fake.asI18n(), i18nKey: "probe", params: { count: 2 } },
    });

    expect(fake.tRaw).toHaveBeenLastCalledWith("probe", expect.objectContaining({ count: 2 }));
  });
});

describe("T.svelte allowedTags tombstone warning", () => {
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

  it("warns once in development when allowedTags is used, and not otherwise", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { probe: "x" } },
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      component = mount(TAllowedTagsTombstoneWrapper, {
        target,
        props: { i18n, i18nKey: "probe" },
      });
      flushSync();
      expect(warn).not.toHaveBeenCalled();
      unmount(component);

      component = mount(TAllowedTagsTombstoneWrapper, {
        target,
        props: { i18n, i18nKey: "probe", allowedTags: ["b"] },
      });
      flushSync();
      expect(target.textContent).toBe("x");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain("<T allowedTags>");
      expect(warn.mock.calls[0]![0]).toContain("components");
      unmount(component);

      // A second use on the SAME host does not warn again.
      component = mount(TAllowedTagsTombstoneWrapper, {
        target,
        props: { i18n, i18nKey: "probe", allowedTags: ["b"] },
      });
      flushSync();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("the allowedTags and raw dedupes are independent on the SAME host", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { probe: "x" } },
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      component = mount(TAllowedTagsTombstoneWrapper, {
        target,
        props: { i18n, i18nKey: "probe", allowedTags: ["b"] },
      });
      flushSync();
      expect(warn).toHaveBeenCalledTimes(1);
      unmount(component);

      // The `raw` deprecation is a DIFFERENT warning, so it still fires on a
      // host that has already triggered the allowedTags one.
      component = mount(TAllowedTagsTombstoneWrapper, {
        target,
        props: { i18n, i18nKey: "probe", raw: true },
      });
      flushSync();
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[1]![0]).toContain("<T raw>");
    } finally {
      warn.mockRestore();
    }
  });
});
