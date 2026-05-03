import { describe, expect, it, vi } from "vitest";

const localePathSpy = vi.fn((to: string | Record<string, unknown>, locale?: string) => {
  if (typeof to === "string") {
    return locale ? `/${locale}${to}` : to;
  }
  return locale ? `/${locale}/resolved` : "/resolved";
});

vi.mock("../src/runtime/composables/useLocalePath", () => ({
  useLocalePath: () => localePathSpy,
}));

describe("T component", () => {
  it("is a valid Vue component re-exported from @comvi/vue", async () => {
    const { T } = await import("../src/runtime/components/T");
    const { T: VueT } = await import("@comvi/vue");

    expect(T.name).toBe("T");
    // Nuxt T component should be the exact same component from @comvi/vue
    expect(T).toBe(VueT);
  });
});

describe("NuxtLinkLocale component", () => {
  it("is a valid Vue component named NuxtLinkLocale", async () => {
    const mod = await import("../src/runtime/components/NuxtLinkLocale");
    const component = mod.default;

    expect(component.name).toBe("NuxtLinkLocale");
  });

  // Direct setup() invocation is used because NuxtLinkLocale depends on
  // Nuxt's #components import (NuxtLink) and composables that are difficult
  // to mock through Vue test-utils mounting. Calling setup() directly lets us
  // test the render function output without a full Nuxt runtime.
  it("builds localized path and forwards attributes to NuxtLink", async () => {
    localePathSpy.mockClear();
    const component = (await import("../src/runtime/components/NuxtLinkLocale")).default as any;

    const render = component.setup(
      { to: "/about", locale: "de" },
      {
        attrs: { target: "_blank", rel: "noreferrer" },
        slots: {},
      },
    );

    const vnode = render();

    expect(localePathSpy).toHaveBeenCalledWith("/about", "de");
    expect(vnode.props).toMatchObject({
      to: "/de/about",
      target: "_blank",
      rel: "noreferrer",
    });

    // Verify a second setup() with different props produces a different localized path,
    // confirming the computed property uses the props reactively.
    const render2 = component.setup(
      { to: "/about", locale: "uk" },
      {
        attrs: { target: "_blank" },
        slots: {},
      },
    );

    const vnode2 = render2();
    expect(localePathSpy).toHaveBeenCalledWith("/about", "uk");
    expect(vnode2.props.to).toBe("/uk/about");
  });

  it("uses current locale when no explicit locale prop is provided", async () => {
    localePathSpy.mockClear();
    const component = (await import("../src/runtime/components/NuxtLinkLocale")).default as any;

    const render = component.setup(
      { to: "/contact", locale: undefined },
      {
        attrs: {},
        slots: {},
      },
    );

    const vnode = render();

    expect(localePathSpy).toHaveBeenCalledWith("/contact", undefined);
    expect(vnode.props.to).toBe("/contact");
  });

  it("handles route object in the to prop", async () => {
    localePathSpy.mockClear();
    const component = (await import("../src/runtime/components/NuxtLinkLocale")).default as any;

    const routeObj = { name: "products", query: { sort: "asc" } };
    const render = component.setup(
      { to: routeObj, locale: "uk" },
      {
        attrs: { class: "nav-link" },
        slots: {},
      },
    );

    const vnode = render();

    expect(localePathSpy).toHaveBeenCalledWith(routeObj, "uk");
    expect(vnode.props).toMatchObject({
      to: "/uk/resolved",
      class: "nav-link",
    });
  });
});
