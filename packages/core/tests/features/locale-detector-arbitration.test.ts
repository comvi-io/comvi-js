/**
 * What `init()` does with the locale a registered detector returns, when the
 * plugin phase has already put a locale switch in flight.
 *
 * `plugins-failure-reports.test.ts` pins the empty-string case (a detector may
 * decline). The claim here is the other half of the same guard: a detector that
 * merely CONFIRMS the current locale must be a no-op. Handing it to
 * `setLocaleAsync` would look harmless — the locale is already applied — but
 * that call bumps the change id, and the bump cancels the switch a plugin
 * started a moment earlier.
 */
import { describe, it, expect } from "vitest";
import { I18n } from "../../src/core/full";
import { createDeferred, type Deferred } from "../helpers/deferred";

type Catalog = Record<string, string>;

describe("init() with a locale detector", () => {
  it("leaves a switch a plugin started in flight when the detector returns the current locale (sequence)", async () => {
    const settlers = new Map<string, Deferred<Catalog>>();
    const i18n = new I18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { hi: "Hi" } },
    });
    i18n.registerLoader((locale, namespace) => {
      const settler = createDeferred<Catalog>();
      settlers.set(`${locale}:${namespace}`, settler);
      return settler.promise;
    });
    const changes: string[] = [];
    i18n.on("localeChanged", ({ from, to }) => changes.push(`${from}->${to}`));
    let switching!: Promise<void>;
    i18n.use((host) => {
      switching = host.setLocaleAsync("fr");
      host.registerLocaleDetector(() => "en");
    });

    await i18n.init();
    settlers.get("fr:default")!.resolve({ hi: "Salut" });
    await switching;

    expect(i18n.locale).toBe("fr");
    expect(i18n.t("hi")).toBe("Salut");
    expect(changes).toEqual(["en->fr"]);
  });
});
