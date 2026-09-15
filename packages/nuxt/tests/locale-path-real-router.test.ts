import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { createMemoryHistory, createRouter, type RouteRecordRaw } from "vue-router";
import { resetMocks, setMockRoute, setRouterResolveOverride } from "./mocks/nuxt-app";
import { useLocalePath } from "../src/runtime/composables/useLocalePath";
import { useSwitchLocalePath } from "../src/runtime/composables/useSwitchLocalePath";

/**
 * These cases run against a REAL `vue-router`, not the `resolve` stub in
 * `tests/mocks/nuxt-app.ts`. The stub echoes `to.path` back, so a route object
 * carrying an external path came out of it unchanged and a fixed and an
 * unfixed composable produced the same string — the mock cannot see the bug at
 * all. A real router resolves a route object RELATIVE to the current route,
 * which is what turns `{ path: "https://example.com/a" }` into
 * `/en/https://example.com/a` and what makes a pathless object inherit the
 * current path.
 */
const Stub = defineComponent({ name: "Stub", render: () => h("div") });

const ROUTES: RouteRecordRaw[] = [
  { path: "/", name: "index", component: Stub },
  { path: "/pricing", name: "pricing", component: Stub },
  { path: "/about", name: "about", component: Stub },
  { path: "/en/pricing", name: "pricing___en", component: Stub },
  { path: "/de/pricing", name: "pricing___de", component: Stub },
  { path: "/de/about", name: "about___de", component: Stub },
  { path: "/:pathMatch(.*)*", name: "catch-all", component: Stub },
];

/**
 * Points the Nuxt `useRouter` stub at a real router standing on `path`, and
 * mirrors that route into the `useRoute` stub the other composables read.
 */
async function realRouterAt(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push(path);
  await router.isReady();
  setRouterResolveOverride((to) => router.resolve(to));
  const current = router.currentRoute.value;
  setMockRoute({ path: current.path, fullPath: current.fullPath });
  return router;
}

describe("useLocalePath against a real vue-router", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("resolves a plain internal route object relative to the real router", async () => {
    await realRouterAt("/en/pricing");
    const localePath = useLocalePath();

    expect(localePath({ path: "/about" }, "de")).toBe("/de/about");
  });

  describe("route object with an external path (H2)", () => {
    it("returns the path the caller wrote, not the router's relative resolution", async () => {
      await realRouterAt("/en/pricing");
      const localePath = useLocalePath();

      expect(localePath({ path: "https://example.com/a" }, "de")).toBe("https://example.com/a");
      expect(localePath({ path: "mailto:someone@example.com" }, "de")).toBe(
        "mailto:someone@example.com",
      );
      expect(localePath({ path: "//cdn.example.com/app.js" }, "de")).toBe(
        "//cdn.example.com/app.js",
      );
    });

    it("serializes the object's own query and hash onto the written path", async () => {
      // The router never sees the target, so the composable writes the suffix
      // itself, in URL order: query before fragment.
      await realRouterAt("/en/pricing");
      const localePath = useLocalePath();

      expect(localePath({ path: "https://example.com/a", query: { ref: "nav" } }, "de")).toBe(
        "https://example.com/a?ref=nav",
      );
      expect(localePath({ path: "https://example.com/a", hash: "#top" }, "de")).toBe(
        "https://example.com/a#top",
      );
      expect(
        localePath({ path: "https://example.com/a", query: { a: "1", b: "2" }, hash: "top" }, "de"),
      ).toBe("https://example.com/a?a=1&b=2#top");
    });

    it("merges into a query the written path already carries and keeps its fragment last", async () => {
      await realRouterAt("/en/pricing");
      const localePath = useLocalePath();

      expect(localePath({ path: "https://example.com/a?x=1", query: { ref: "nav" } }, "de")).toBe(
        "https://example.com/a?x=1&ref=nav",
      );
      expect(localePath({ path: "https://example.com/a#top", query: { ref: "nav" } }, "de")).toBe(
        "https://example.com/a?ref=nav#top",
      );
    });

    it("keeps a fragment the written path already carries instead of adding a second", async () => {
      await realRouterAt("/en/pricing");
      const localePath = useLocalePath();

      expect(localePath({ path: "https://example.com/a#own", hash: "#other" }, "de")).toBe(
        "https://example.com/a#own",
      );
    });
  });

  describe("pathless targets (M3)", () => {
    it("localizes a route object with only query and hash against the CURRENT route", async () => {
      // A route object is a vue-router location: the router resolves it against
      // the route the user is on, so the page is kept and only the locale
      // changes. `/de` (next's `localizeUrlObject`) would drop the page.
      await realRouterAt("/en/pricing");
      const localePath = useLocalePath();

      expect(localePath({ query: { a: "b" }, hash: "#top" }, "de")).toBe("/de/pricing?a=b#top");
    });

    it("leaves a query-only or fragment-only STRING untouched", async () => {
      // The browser resolves these against the current, already localized URL,
      // so there is nothing to rewrite — same as next's `localizeHref`.
      await realRouterAt("/en/pricing");
      const localePath = useLocalePath();

      expect(localePath("?tab=billing", "de")).toBe("?tab=billing");
      expect(localePath("#details", "de")).toBe("#details");
    });
  });

  describe("leading double slash after prefix stripping (M12)", () => {
    it("collapses the leading slash run instead of emitting a protocol-relative path", async () => {
      await realRouterAt("/en/pricing");
      const localePath = useLocalePath();

      expect(localePath("/en//evil.com", "en")).toBe("/evil.com");
      expect(localePath("/en//evil.com", "de")).toBe("/de/evil.com");
      // Interior doubled slashes stay as the caller wrote them, like next.
      expect(localePath("/en/a//b", "de")).toBe("/de/a//b");
    });
  });
});

describe("useSwitchLocalePath leading double slash (M12)", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("collapses the leading slash run left by prefix stripping", () => {
    setMockRoute({ path: "/en//evil.com", fullPath: "/en//evil.com" });
    const switchLocalePath = useSwitchLocalePath();

    expect(switchLocalePath("en")).toBe("/evil.com");
    expect(switchLocalePath("de")).toBe("/de/evil.com");
  });

  it("keeps an ordinary path and its interior slashes untouched", () => {
    setMockRoute({ path: "/en/a//b", fullPath: "/en/a//b?x=1" });
    const switchLocalePath = useSwitchLocalePath();

    expect(switchLocalePath("de")).toBe("/de/a//b?x=1");
  });
});
