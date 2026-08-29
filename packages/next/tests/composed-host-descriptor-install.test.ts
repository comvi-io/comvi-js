import { describe, it, expect, vi } from "vitest";

/**
 * B7, the MECHANISM half — the builder must install its `registerLoader`
 * overload with a DESCRIPTOR, not with a plain assignment.
 *
 * `tests/composed-host-reflection.test.ts` pins the observable invariant
 * (`{ ...host }` carries data only). That invariant is satisfied by a plain
 * `host.registerLoader = fn` too — but only ACCIDENTALLY, and only for as long
 * as `attachLoader` installs the capability as an OWN, writable descriptor:
 * `[[Set]]` on an existing own writable data property updates `[[Value]]` and
 * keeps `enumerable: false`. Install the same capability on a PROTOTYPE — which
 * is precisely what `@comvi/core`'s `core/full.ts` composite does — and the
 * assignment creates a fresh own property with the default attributes, i.e.
 * `enumerable: true`, silently leaking a method into every spread copy.
 *
 * So this file swaps in the prototype install and re-asserts the contract.
 * It fails on a plain assignment and passes on `Object.defineProperty`,
 * which is the difference the reflection suite alone cannot see.
 */
vi.mock("@comvi/core/loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@comvi/core/loader")>();

  return {
    ...actual,
    attachLoader: (i18n: object) => {
      const host = actual.attachLoader(i18n as never) as unknown as Record<string, unknown>;
      const descriptor = Object.getOwnPropertyDescriptor(host, "registerLoader")!;

      // Re-home `registerLoader` from the instance onto a per-instance
      // intermediate prototype (never `I18n.prototype` — that would leak into
      // every other host in the run).
      delete host.registerLoader;
      Object.setPrototypeOf(
        host,
        Object.create(Object.getPrototypeOf(host) as object, { registerLoader: descriptor }),
      );

      return host;
    },
  };
});

const ROUTING = { locales: ["en", "de"], defaultLocale: "en" } as const;

describe("createNextI18n composed host — descriptor install, not assignment (B7)", () => {
  it("keeps registerLoader non-enumerable even when the capability lives on a prototype", async () => {
    const { createNextI18n } = await import("../src/createNextI18n");
    const { i18n } = createNextI18n({ ...ROUTING });

    // Precondition: the mock really did move the capability off the instance,
    // so a plain assignment WOULD create a fresh own property here.
    expect(
      Object.getPrototypeOf(i18n) as object,
      "the prototype install must be in effect",
    ).toHaveProperty("registerLoader");

    expect(Object.keys(i18n)).not.toContain("registerLoader");

    const descriptor = Object.getOwnPropertyDescriptor(i18n, "registerLoader")!;
    expect(descriptor, "the builder still owns the overload").toBeDefined();
    expect({
      writable: descriptor.writable,
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
    }).toEqual({ writable: true, enumerable: false, configurable: true });

    const spread = { ...i18n } as Record<string, unknown>;
    expect(Object.keys(spread).filter((key) => typeof spread[key] === "function")).toEqual([]);
  });

  it("still serves the import-map overload through the prototype-installed base", async () => {
    const { createNextI18n } = await import("../src/createNextI18n");
    const { i18n } = createNextI18n({ ...ROUTING });

    i18n.registerLoader({ en: () => Promise.resolve({ default: { k: "EN" } }) });
    await i18n.init();

    expect(i18n.t("k")).toBe("EN");
  });
});
