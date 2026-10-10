import { beforeEach, describe, expect, it } from "vitest";
import { createApp, type Component } from "vue";
import { mockRuntimeConfig, resetMocks } from "./mocks/nuxt-app";
import { useLocalePath } from "../src/runtime/composables/useLocalePath";

/**
 * Parity with `@comvi/next`'s `localizeHref` / `localizeUrlObject` guards
 * (packages/next/tests/routing.test.ts, "keeps external hrefs intact and
 * preserves query/hash"): only an app-internal path is localized. A scheme, a
 * protocol-relative host, a query-only and a fragment-only target are handed
 * back byte-identical — a fragment or query with no path attaches to whatever
 * the current localized URL is, which is exactly what the caller wrote it for;
 * prefixing it would move the link to the locale root instead.
 */
const UNTOUCHED_TARGETS = [
  "https://example.com/about",
  "HTTPS://example.com/about",
  "http://example.com/about",
  "mailto:someone@example.com",
  "tel:+15551234567",
  "custom.scheme-1+x:payload",
  "//cdn.example.com/app.js",
  "?tab=billing",
  "#details",
];

/** Mounts NuxtLinkLocale with the REAL composable and returns the href. */
async function renderLinkHref(props: Record<string, unknown>): Promise<string | null> {
  const component = (await import("../src/runtime/components/NuxtLinkLocale")).default as Component;
  const host = document.createElement("div");
  createApp(component, props).mount(host);
  return host.querySelector("a")?.getAttribute("href") ?? null;
}

describe("useLocalePath target forms", () => {
  beforeEach(() => {
    resetMocks();
  });

  it.each(UNTOUCHED_TARGETS)("leaves %s untouched", (target) => {
    const localePath = useLocalePath();

    expect(localePath(target, "de")).toBe(target);
  });

  it.each(UNTOUCHED_TARGETS)("leaves %s untouched under localePrefix always", (target) => {
    mockRuntimeConfig.public.comvi.localePrefix = "always";
    const localePath = useLocalePath();

    expect(localePath(target, "de")).toBe(target);
  });

  it("still localizes an internal path that carries query and hash", () => {
    const localePath = useLocalePath();

    expect(localePath("/about?x=1#top", "de")).toBe("/de/about?x=1#top");
  });

  it("localizes a path whose segment contains a colon", () => {
    // Only a LEADING scheme makes a target external; a colon inside a segment
    // is an ordinary path character. Same rule as next.
    const localePath = useLocalePath();

    expect(localePath("/notes:2024", "de")).toBe("/de/notes:2024");
  });

  // ROUTE OBJECTS are asserted in `locale-path-real-router.test.ts` instead.
  // The `useRouter` stub in `tests/mocks/nuxt-app.ts` echoes `to.path` back, so
  // an external object path came out of it unchanged and these assertions held
  // whether the composable guarded the target or not. A real vue-router
  // resolves an object RELATIVE to the current route, which is the only way to
  // see the behaviour. What stays here is the STRING form, which never reaches
  // the router at all.

  it("still localizes a route object with an internal path", () => {
    const localePath = useLocalePath();

    expect(localePath({ path: "/contact", query: { x: "1" }, hash: "#form" }, "de")).toBe(
      "/de/contact?x=1#form",
    );
  });
});

describe("NuxtLinkLocale target forms", () => {
  beforeEach(() => {
    resetMocks();
  });

  it.each(UNTOUCHED_TARGETS)("renders %s as the href unchanged", async (target) => {
    expect(await renderLinkHref({ to: target, locale: "de" })).toBe(target);
  });

  it("still localizes an internal to prop", async () => {
    expect(await renderLinkHref({ to: "/about", locale: "de" })).toBe("/de/about");
  });

  it("renders a route object with an external path unchanged", async () => {
    // Meaningful now that the composable answers an external object path
    // without consulting the router: the `resolve` stub is never called, so
    // nothing here rides on its echo. What the mock `NuxtLink` still cannot
    // show is how the REAL NuxtLink treats an external href.
    expect(await renderLinkHref({ to: { path: "https://example.com/a" }, locale: "de" })).toBe(
      "https://example.com/a",
    );
  });
});
