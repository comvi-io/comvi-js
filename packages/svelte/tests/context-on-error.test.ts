/**
 * `setI18nContext(i18n, { onError })` — the per-app hook react's and solid's
 * providers already expose. The auto-init runs in a microtask, so a rejection
 * has nowhere else to surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import ContextOnErrorHarness from "./ContextOnErrorHarness.test.svelte";
import { createI18n } from "../src/index";

describe("setI18nContext onError", () => {
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

  it("auto-init rejects → onError receives the error", async () => {
    const fake = new FakeI18n({ language: "en" });
    fake.initError = new Error("init failed");
    const errors: Error[] = [];

    component = mount(ContextOnErrorHarness, {
      target,
      props: { i18n: fake.asI18n(), onError: (error: Error) => errors.push(error) },
    });

    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(errors[0].message).toBe("init failed");
  });

  it("auto-init resolves → onError is never called", async () => {
    const fake = new FakeI18n({ language: "en" });
    const errors: Error[] = [];

    component = mount(ContextOnErrorHarness, {
      target,
      props: { i18n: fake.asI18n(), onError: (error: Error) => errors.push(error) },
    });

    await vi.waitFor(() => {
      expect(fake.isInitialized).toBe(true);
    });
    expect(errors).toEqual([]);
  });

  it("auto-init rejects with no onError → the component still mounts", async () => {
    const fake = new FakeI18n({ language: "en" });
    fake.initError = new Error("init failed");

    component = mount(ContextOnErrorHarness, { target, props: { i18n: fake.asI18n() } });

    await vi.waitFor(() => {
      expect(fake.init).toHaveBeenCalledTimes(1);
    });
    expect(target.querySelector('[data-testid="mounted"]')).not.toBeNull();
  });

  it("core reports the failure before onError runs", async () => {
    const reported: string[] = [];
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      onError: () => reported.push("core"),
    });
    await i18n.destroy();

    component = mount(ContextOnErrorHarness, {
      target,
      props: { i18n, onError: () => reported.push("context") },
    });

    await vi.waitFor(() => {
      expect(reported).toEqual(["core", "context"]);
    });
  });
});
