// `acquireLoaderApi` / `acquirePluginsApi` — the ONE component-side
// acquisition, hoisted out of the four framework bindings.
//
// Until 0.5 each of `@comvi/react`, `@comvi/vue`, `@comvi/solid` and
// `@comvi/svelte` owned a byte-identical copy of this code, pinned by a
// text-diff gate in `scripts/wrapper-hooks-parity.test.mjs` because the copies
// HAD drifted: react wrapped the `onMissingKey` callback in a `String(result)`
// coercion the other three did not have, narrowing core's
// `TranslationResult | void` to a string in one framework only. The region is
// gone and so is the text gate; what it proved is asserted here instead, once,
// against the implementation all four now call.
import { describe, expect, it } from "vitest";
import { createI18n } from "../../src";
import * as rootEntry from "../../src";
import * as loaderEntry from "../../src/loader";
import * as pluginsEntry from "../../src/plugins";
import { acquireLoaderApi, attachLoader } from "../../src/loader";
import { acquirePluginsApi, attachPlugins } from "../../src/plugins";
import type { VirtualNode } from "../../src/virtualNode";

const bareHost = () =>
  createI18n({ locale: "en", exposeGlobal: false, translation: { en: { greeting: "Hello" } } });

describe("the acquirers exist once, on the capability subpaths", () => {
  it("publishes each acquirer from its own subpath and from nowhere else", () => {
    expect(typeof loaderEntry.acquireLoaderApi).toBe("function");
    expect(typeof pluginsEntry.acquirePluginsApi).toBe("function");

    expect(Object.keys(loaderEntry)).not.toContain("acquirePluginsApi");
    expect(Object.keys(pluginsEntry)).not.toContain("acquireLoaderApi");
  });

  // `core-base` is the gated floor every other size row is read against, and an
  // app that never acquires a capability must not carry the acquisition.
  it("keeps both acquirers OFF the @comvi/core root", () => {
    expect(Object.keys(rootEntry)).not.toContain("acquireLoaderApi");
    expect(Object.keys(rootEntry)).not.toContain("acquirePluginsApi");
  });
});

describe("acquireLoaderApi()", () => {
  it("throws the capability error on a host nobody composed a loader onto", () => {
    expect(() => acquireLoaderApi(bareHost())).toThrow(
      '[comvi] This i18n instance has no loader capability. Compose it: .use(attachLoader) from "@comvi/core/loader", or loader(map).',
    );
  });

  it("throws for the capability that is missing, not the one that is present", () => {
    const pluginsOnly = attachPlugins(bareHost());

    expect(() => acquireLoaderApi(pluginsOnly)).toThrow("no loader capability");
    expect(() => acquirePluginsApi(pluginsOnly)).not.toThrow();
  });

  it("hands back exactly the six driveable members, bound to the host", async () => {
    const host = attachLoader(bareHost());
    const loaded: string[] = [];
    host.registerLoader(async (locale, ns) => {
      loaded.push(`${locale}:${ns}`);
      return { extra: "loaded" };
    });

    const bag = acquireLoaderApi(host);

    expect(Object.keys(bag).sort()).toEqual(
      [
        "addActiveNamespace",
        "addActiveNamespaces",
        "removeActiveNamespace",
        "removeActiveNamespaces",
        "onLoadError",
        "reloadTranslations",
      ].sort(),
    );

    // Bound: the members work detached from the host they came from.
    const { addActiveNamespace, removeActiveNamespace } = bag;
    await addActiveNamespace("dashboard");
    expect(loaded).toEqual(["en:dashboard"]);
    removeActiveNamespace("dashboard");
    expect(host.getActiveNamespaces()).not.toContain("dashboard");
  });

  it("caches ONE bag per host and never shares it between hosts", () => {
    const one = attachLoader(bareHost());
    const two = attachLoader(bareHost());

    const first = acquireLoaderApi(one);

    expect(acquireLoaderApi(one)).toBe(first);
    expect(acquireLoaderApi(one).reloadTranslations).toBe(first.reloadTranslations);
    expect(acquireLoaderApi(two)).not.toBe(first);
  });

  it("acquires after a LATE attach on the same host — the guard is not cached", () => {
    const host = bareHost();

    expect(() => acquireLoaderApi(host)).toThrow("no loader capability");

    attachLoader(host);
    expect(typeof acquireLoaderApi(host).reloadTranslations).toBe("function");
  });
});

describe("acquirePluginsApi()", () => {
  it("throws the capability error on a bare host", () => {
    expect(() => acquirePluginsApi(bareHost())).toThrow(
      '[comvi] This i18n instance has no plugins capability. Compose it: .use(plugins()) from "@comvi/core/plugins", or the lower-level attachPlugins.',
    );
  });

  it("hands back onMissingKey alone, bound to the host", () => {
    const host = attachPlugins(bareHost());

    const bag = acquirePluginsApi(host);

    expect(Object.keys(bag)).toEqual(["onMissingKey"]);
    const off = bag.onMissingKey((key) => `[${key}]`);
    expect(host.t("nope")).toBe("[nope]");
    off();
    expect(host.t("nope")).toBe("nope");
  });

  it("caches ONE bag per host", () => {
    const host = attachPlugins(bareHost());

    const first = acquirePluginsApi(host);

    expect(acquirePluginsApi(host)).toBe(first);
    expect(acquirePluginsApi(host).onMissingKey).toBe(first.onMissingKey);
  });

  // THE drift this acquisition was hoisted to make impossible: `onMissingKey`
  // is the BOUND HOST METHOD, so a callback returning the
  // `Array<string | VirtualNode>` half of `TranslationResult` reaches core
  // untouched and core — not the caller — flattens it to text.
  it("does NOT coerce the onMissingKey callback result", () => {
    const richFallback: (string | VirtualNode)[] = [
      "rich-",
      { type: "element", tag: "b", props: {}, children: ["fallback"] },
    ];
    const host = attachPlugins(bareHost());

    const off = acquirePluginsApi(host).onMissingKey(() => richFallback);

    expect(host.tRaw("absent")).toEqual(richFallback);
    expect(host.t("absent")).toBe("rich-fallback");
    off();
  });

  it("registers the callback itself — the host sees no wrapping closure", () => {
    const host = attachPlugins(bareHost());
    let received: unknown[] | undefined;

    const off = acquirePluginsApi(host).onMissingKey((...args) => {
      received = args;
    });

    host.t("absent");

    expect(received).toEqual(["absent", "en", "default"]);
    off();
  });
});
