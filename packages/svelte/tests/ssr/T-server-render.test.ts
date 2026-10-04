/**
 * The SERVER render path for `<T>`'s components map — the gap
 * `ssr-isolation.test.ts` documents but cannot cover, because the `unit`
 * project pins `resolve.conditions` to `["browser"]` and `svelte/server`
 * `render()` needs server-compiled components. This file runs under the `ssr`
 * vitest project (`environment: "node"`, conditions `["svelte", "node"]`).
 *
 * Why it matters: `<svelte:boundary>` (`src/T.svelte`) does NOT catch during
 * SSR. So a components-map entry whose handler is not renderable degrades
 * gracefully on the client but takes the WHOLE server render down here —
 * `render()` throws and the body is lost. That is the consequence that makes
 * the `ComponentHandler` config form require one of `tag`/`component`: the
 * type is the only gate in front of it.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import TInterpolationWrapper from "../TInterpolationWrapper.test.svelte";
import { createI18n } from "../../src/index";
import type { ComponentMap } from "../../src/index";

const makeI18n = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    messages: { en: { welcome: "Hello <strong>{name}</strong>!" } },
  });

describe("T.svelte server render — components map", () => {
  it("renders a { tag, props } config entry, `false` props stripped", () => {
    const { body } = render(TInterpolationWrapper, {
      props: {
        i18n: makeI18n(),
        i18nKey: "welcome",
        params: { name: "Ada" },
        components: {
          strong: { tag: "em", props: { class: "hl", hidden: true, disabled: false } },
        } satisfies ComponentMap,
      },
    });

    expect(body).toContain("Hello");
    expect(body).toContain("Ada");
    expect(body).toContain('<em class="hl" hidden=""');
    // `elementProps` drops a `false` value rather than emitting the attribute.
    expect(body).not.toContain("disabled");
  });

  it("a bare string mapping renders as that element", () => {
    const { body } = render(TInterpolationWrapper, {
      props: {
        i18n: makeI18n(),
        i18nKey: "welcome",
        params: { name: "Ada" },
        components: { strong: "b" } satisfies ComponentMap,
      },
    });

    expect(body).toContain("<b>");
    expect(body).toContain("Ada");
  });

  it("a targetless config entry takes the whole server render down", () => {
    const i18n = makeI18n();
    const reportError = vi.spyOn(i18n, "reportError").mockImplementation(() => {});

    // `as never`: the type now REJECTS this shape (see
    // `tests/types/components-map.test-d.ts`). The cast is what a caller on a
    // JS codebase, or one reaching for `any`, still gets — and this is the
    // damage the type is there to prevent.
    const targetless = { strong: { props: { class: "hl" } } } as never;

    // `render()` is lazy — the payload is assembled when `body` is read, so
    // that is where a server render actually dies.
    const result = render(TInterpolationWrapper, {
      props: { i18n, i18nKey: "welcome", params: { name: "Ada" }, components: targetless },
    });
    expect(() => result.body).toThrow();

    // No boundary on the server, so the failure never reaches reportError
    // either — unlike the client path (`T-handler-error.test.ts`).
    expect(reportError).not.toHaveBeenCalled();
  });
});
