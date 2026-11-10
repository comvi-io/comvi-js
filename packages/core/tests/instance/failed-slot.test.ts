/**
 * A server payload's failed (`null`) slot handed over after creation (lot 6a, owner decision
 * after the review): `view()` renders without the slot, `Core.f` gives the instance the same
 * meaning `createI18n({ catalogs })` gives a `null` slot.
 */
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src/instance";
import { core, state, translate, view } from "../../src/internal";

const setup = () => {
  const loader = vi.fn(async (l: string, _ns: string) => ({ t: `loaded ${l}` }));
  const i18n = createI18n({
    locale: "uk",
    fallbackLocale: "en",
    loader,
    catalogs: { default: { uk: { t: "Привіт" }, en: { t: "Hello" } } },
  });
  return { i18n, loader };
};

describe("a failed slot after creation", () => {
  it("view() renders the fallback without the slot and publishes nothing", () => {
    const { i18n } = setup();
    const s = state(i18n);
    const v = view(i18n, s, { default: { uk: null } });
    expect(translate(i18n, v, "t")).toBe("Hello");
    expect(state(i18n)).toBe(s);
    expect(i18n.t("t")).toBe("Привіт");
    // A null for a slot nobody has changes nothing.
    expect(view(i18n, s, { admin: { uk: null } })).toBe(s);
  });

  it("Core.f takes the catalog out, fails the pair, and only an explicit retry asks for it", async () => {
    const { i18n, loader } = setup();
    await i18n.ready;
    const rev = i18n.rev();
    core(i18n).f("uk", "default");
    expect(i18n.rev()).toBe(rev + 1);
    expect(i18n.t("t")).toBe("Hello");
    // A consumer's hold does not ask for a failed pair.
    core(i18n).h("default");
    await i18n.ready;
    expect(loader).not.toHaveBeenCalled();
    // The same failure again publishes nothing.
    core(i18n).f("uk", "default");
    expect(i18n.rev()).toBe(rev + 1);
    await i18n.load("default");
    expect(loader.mock.calls.map((c) => c[0])).toEqual(["uk"]);
    expect(i18n.t("t")).toBe("loaded uk");
  });

  it("a namespace first seen failed is needed (handed over as null) and not asked for", async () => {
    const { i18n, loader } = setup();
    core(i18n).f("uk", "admin");
    core(i18n).h("admin");
    await i18n.ready;
    expect(loader.mock.calls.filter((c) => c[1] === "admin").map((c) => c[0])).toEqual(["en"]);
    expect(core(i18n).b.has("uk\0admin")).toBe(true);
  });
});
