/**
 * A tag handler that throws must degrade to the translation's own children
 * rather than tearing down the tree, and the failure must reach
 * `i18n.reportError` with the tag name — the same contract React's `<T>`
 * carries (`react/src/T.tsx`, the try/catch around `resolvePending`).
 *
 * A CLIENT render on purpose: `<svelte:boundary>` does not catch errors thrown
 * during SSR, so an SSR-shaped case would pass without the boundary existing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import TInterpolationWrapper from "./TInterpolationWrapper.test.svelte";
import ThrowingHandler from "./ThrowingHandler.test.svelte";
import { createI18n } from "../src/index";

describe("T.svelte tag-handler error path", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  const makeI18n = () =>
    createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { welcome: "Hello <strong>{name}</strong>!" } },
    });

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

  it("renders the handler's children instead of tearing the tree down", async () => {
    const i18n = makeI18n();

    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n,
        i18nKey: "welcome",
        params: { name: "Ada" },
        components: { strong: ThrowingHandler },
      },
    });

    await tick();

    const rendered = target.querySelector('[data-testid="t-interpolation-wrapper"]');
    expect(rendered?.textContent).toContain("Hello");
    expect(rendered?.textContent).toContain("Ada");
  });

  it("reports the failure with the tag name as written in the template", async () => {
    const i18n = makeI18n();
    const reportError = vi.spyOn(i18n, "reportError").mockImplementation(() => {});

    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n,
        i18nKey: "welcome",
        params: { name: "Ada" },
        components: { strong: ThrowingHandler },
      },
    });

    await tick();
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "handler exploded" }),
      { source: "translation", tagName: "strong" },
    );
  });

  it("leaves a working handler alone", async () => {
    const i18n = makeI18n();
    const reportError = vi.spyOn(i18n, "reportError").mockImplementation(() => {});

    component = mount(TInterpolationWrapper, {
      target,
      props: { i18n, i18nKey: "welcome", params: { name: "Ada" }, components: { strong: "b" } },
    });

    await tick();

    expect(target.querySelector("b")?.textContent).toBe("Ada");
    expect(reportError).not.toHaveBeenCalled();
  });
});
