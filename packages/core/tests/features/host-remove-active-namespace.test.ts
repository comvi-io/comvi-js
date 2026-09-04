/**
 * `removeActiveNamespace()` is the deactivation.
 *
 * `clearTranslations()` drops CONTENT in every form; intent moves only through
 * the activation pair. Deactivating stops the namespace being refetched by a
 * reload or a locale switch and cancels whatever load is in flight for it, and
 * it emits the same `configChanged` event activation does so that a binding
 * reading `getActiveNamespaces()` re-renders.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";
import { createDeferred } from "../helpers/deferred";
import { flushMicrotasks } from "../helpers/flush";

function recordingHost() {
  const loads: string[] = [];
  const i18n = attachLoader(createI18n({ locale: "en", ns: [], exposeGlobal: false }));
  i18n.registerLoader(async (locale, namespace) => {
    loads.push(`${locale}:${namespace}`);
    return { key: `${locale}/${namespace}` };
  });
  return { i18n, loads };
}

describe("removeActiveNamespace()", () => {
  it("drops the namespace from the active set", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespaces(["nav", "admin"]);

    i18n.removeActiveNamespace("admin");

    expect(i18n.getActiveNamespaces()).toEqual(["nav"]);
  });

  it("keeps the namespace's content, so it still resolves until it is cleared", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespace("admin");

    i18n.removeActiveNamespace("admin");

    expect(i18n.t("key", { ns: "admin" })).toBe("en/admin");
  });

  it("stops reloadTranslations() refetching it", async () => {
    const { i18n, loads } = recordingHost();
    await i18n.addActiveNamespaces(["nav", "admin"]);
    loads.length = 0;

    i18n.removeActiveNamespace("admin");
    await i18n.reloadTranslations();

    expect(loads).toEqual(["en:nav"]);
  });

  it("stops setLocaleAsync() loading it for the new locale", async () => {
    const { i18n, loads } = recordingHost();
    await i18n.addActiveNamespaces(["nav", "admin"]);
    loads.length = 0;

    i18n.removeActiveNamespace("admin");
    await i18n.setLocaleAsync("de");

    expect(loads).toEqual(["de:nav"]);
  });

  it("cancels the namespace's in-flight load, so its catalog never lands", async () => {
    const admin = createDeferred<Record<string, string>>();
    const i18n = attachLoader(createI18n({ locale: "en", ns: [], exposeGlobal: false }));
    i18n.registerLoader(() => admin.promise);
    void i18n.addActiveNamespace("admin");

    i18n.removeActiveNamespace("admin");
    admin.resolve({ key: "late" });
    await flushMicrotasks();

    expect(i18n.hasLocale("en", "admin")).toBe(false);
  });

  it("leaves another namespace's in-flight load alone", async () => {
    const pending: Record<string, ReturnType<typeof createDeferred<Record<string, string>>>> = {
      nav: createDeferred(),
      admin: createDeferred(),
    };
    const i18n = attachLoader(createI18n({ locale: "en", ns: [], exposeGlobal: false }));
    i18n.registerLoader((_locale, namespace) => pending[namespace]!.promise);
    void i18n.addActiveNamespaces(["nav", "admin"]);

    i18n.removeActiveNamespace("admin");
    pending.nav!.resolve({ key: "nav-loaded" });
    pending.admin!.resolve({ key: "admin-loaded" });
    await flushMicrotasks();

    expect(i18n.hasLocale("en", "nav")).toBe(true);
  });

  it("emits configChanged so a binding reading getActiveNamespaces() re-renders", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespace("admin");
    const received: unknown[] = [];
    i18n.on("configChanged", (data) => received.push(data));

    i18n.removeActiveNamespace("admin");

    expect(received).toEqual([{ source: "namespaceDeactivated" }]);
  });

  it("bumps configRevision, which is what the React snapshot string reads", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespace("admin");
    const before = i18n.configRevision;

    i18n.removeActiveNamespace("admin");

    expect(i18n.configRevision).toBe(before + 1);
  });

  it("leaves the other namespaces active when the name was never activated", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespaces(["nav", "admin"]);

    i18n.removeActiveNamespace("unknown");

    expect(i18n.getActiveNamespaces()).toEqual(["nav", "admin"]);
  });
});

describe("removeActiveNamespace() and the default-namespace round trip", () => {
  it("gets its content back from the A4 fallback reload but stays deactivated", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n } = recordingHost();
    await i18n.addActiveNamespace("default");

    i18n.removeActiveNamespace("default");
    await i18n.reloadTranslations();

    expect(i18n.t("key")).toBe("en/default");
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });

  it("does not come back when the removed last namespace was NOT the default one", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n, loads } = recordingHost();
    await i18n.addActiveNamespace("admin");
    loads.length = 0;

    i18n.removeActiveNamespace("admin");
    await i18n.reloadTranslations();

    expect(loads).toEqual(["en:default"]);
  });

  it("comes back ACTIVE when addTranslations() carries it, because a merge self-activates", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespace("admin");

    i18n.removeActiveNamespace("admin");
    i18n.addTranslations({ "en:admin": { key: "merged" } });

    expect(i18n.getActiveNamespaces()).toEqual(["admin"]);
  });
});

describe("removeActiveNamespaces()", () => {
  it("drops every namespace it is given", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespaces(["nav", "admin", "footer"]);

    i18n.removeActiveNamespaces(["admin", "footer"]);

    expect(i18n.getActiveNamespaces()).toEqual(["nav"]);
  });

  it("emits configChanged once for the whole batch", async () => {
    const { i18n } = recordingHost();
    await i18n.addActiveNamespaces(["nav", "admin", "footer"]);
    const received: unknown[] = [];
    i18n.on("configChanged", (data) => received.push(data));

    i18n.removeActiveNamespaces(["admin", "footer"]);

    expect(received).toEqual([{ source: "namespaceDeactivated" }]);
  });

  it("cancels the in-flight load of every namespace it is given", async () => {
    const pending: Record<string, ReturnType<typeof createDeferred<Record<string, string>>>> = {
      nav: createDeferred(),
      admin: createDeferred(),
    };
    const i18n = attachLoader(createI18n({ locale: "en", ns: [], exposeGlobal: false }));
    i18n.registerLoader((_locale, namespace) => pending[namespace]!.promise);
    void i18n.addActiveNamespaces(["nav", "admin"]);

    i18n.removeActiveNamespaces(["nav", "admin"]);
    pending.nav!.resolve({ key: "nav-loaded" });
    pending.admin!.resolve({ key: "admin-loaded" });
    await flushMicrotasks();

    expect(i18n.getLoadedLocales()).toEqual([]);
  });
});
