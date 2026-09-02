import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, type Component } from "vue";

const localePathSpy = vi.fn((to: string | Record<string, unknown>, locale?: string) => {
  if (typeof to === "string") {
    return locale ? `/${locale}${to}` : to;
  }
  return locale ? `/${locale}/resolved` : "/resolved";
});

vi.mock("../src/runtime/composables/useLocalePath", () => ({
  useLocalePath: () => localePathSpy,
}));

/** Mounts a component into a detached host and returns the rendered anchor. */
async function renderLink(props: Record<string, unknown>): Promise<HTMLAnchorElement> {
  const component = (await import("../src/runtime/components/NuxtLinkLocale")).default as Component;
  const host = document.createElement("div");
  createApp(component, props).mount(host);

  const anchor = host.querySelector("a");
  expect(anchor).not.toBeNull();
  return anchor as HTMLAnchorElement;
}

describe("T component", () => {
  it("is a valid Vue component re-exported from @comvi/vue", async () => {
    const { T } = await import("../src/runtime/components/T");
    const { T: VueT } = await import("@comvi/vue");

    expect(T.name).toBe("T");
    expect(T).toBe(VueT);
  });
});

describe("NuxtLinkLocale component", () => {
  beforeEach(() => {
    localePathSpy.mockClear();
  });

  it("is a valid Vue component named NuxtLinkLocale", async () => {
    const mod = await import("../src/runtime/components/NuxtLinkLocale");
    const component = mod.default;

    expect(component.name).toBe("NuxtLinkLocale");
  });

  // Two rows of one behaviour: the `locale` prop is what picks the prefix.
  it("builds localized path and forwards attributes to NuxtLink", async () => {
    const german = await renderLink({
      to: "/about",
      locale: "de",
      target: "_blank",
      rel: "noreferrer",
    });
    const ukrainian = await renderLink({ to: "/about", locale: "uk", target: "_blank" });

    expect(localePathSpy).toHaveBeenNthCalledWith(1, "/about", "de");
    expect(german.getAttribute("href")).toBe("/de/about");
    expect(german.getAttribute("target")).toBe("_blank");
    expect(german.getAttribute("rel")).toBe("noreferrer");

    expect(localePathSpy).toHaveBeenNthCalledWith(2, "/about", "uk");
    expect(ukrainian.getAttribute("href")).toBe("/uk/about");
  });

  it("uses current locale when no explicit locale prop is provided", async () => {
    const anchor = await renderLink({ to: "/contact", locale: undefined });

    expect(localePathSpy).toHaveBeenCalledWith("/contact", undefined);
    expect(anchor.getAttribute("href")).toBe("/contact");
  });

  it("warns that `to` is required when a caller omits it", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await renderLink({});

    const warnings = warnSpy.mock.calls.map((args) => String(args[0]));
    expect(warnings).toContainEqual(expect.stringContaining('Missing required prop: "to"'));
  });

  it("handles route object in the to prop", async () => {
    const routeObj = { name: "products", query: { sort: "asc" } };

    const anchor = await renderLink({ to: routeObj, locale: "uk", class: "nav-link" });

    expect(localePathSpy).toHaveBeenCalledWith(routeObj, "uk");
    expect(anchor.getAttribute("href")).toBe("/uk/resolved");
    expect(anchor.getAttribute("class")).toBe("nav-link");
  });
});
