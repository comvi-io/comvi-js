/**
 * `addMessages()` is the newest write for its locale/namespace. A loader
 * request that started before it is older, so it must neither replace the
 * merged catalog nor emit a late `namespaceLoaded`.
 */
import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("addMessages() during a pending load", () => {
  it("keeps the newer manual catalog and drops the older response", async () => {
    const answer = deferred<Record<string, string>>();
    const i18n = attachLoader(createI18n({ locale: "en", ns: [] }));
    i18n.registerLoader(() => answer.promise);
    const loaded: string[] = [];

    const pending = i18n.addActiveNamespace("default");
    i18n.addMessages({ en: { manual: "newer local" } });
    i18n.on("namespaceLoaded", ({ locale, namespace }) => loaded.push(`${locale}:${namespace}`));
    answer.resolve({ remote: "older remote" });
    await pending;

    expect(i18n.t("manual")).toBe("newer local");
    expect(i18n.t("remote")).toBe("remote");
    expect(loaded).toEqual([]);
  });

  it("leaves a pending load for another namespace alone", async () => {
    const answer = deferred<Record<string, string>>();
    const i18n = attachLoader(createI18n({ locale: "en", ns: [] }));
    i18n.registerLoader(() => answer.promise);

    const pending = i18n.addActiveNamespace("admin");
    i18n.addMessages({ en: { manual: "newer local" } });
    answer.resolve({ title: "Admin" });
    await pending;

    expect(i18n.t("title", { ns: "admin" })).toBe("Admin");
    expect(i18n.t("manual")).toBe("newer local");
  });
});
