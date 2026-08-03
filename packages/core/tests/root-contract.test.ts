import { describe, it, expect } from "vitest";
import { I18n } from "../src";

/**
 * Acceptance A11 — the root reflective contract (Phase 7, Principle 1).
 *
 * Phase 7 decomposes the `I18n` class into capability modules. The root entry
 * must keep not only its behavior but its *reflective* surface: consumers spy
 * on, patch, enumerate and feature-detect the class. This suite is written
 * against the untouched class at S1 (it IS the "before" snapshot) and must
 * stay green through S5.
 *
 * On `Object.keys`: the contract pinned here is the PUBLIC observable shape —
 * the exact public own-property list, and the absence of any public method
 * from the own-property set (the failure mode the slim own-prop attach path
 * would introduce if it ever leaked onto root). The `_`-prefixed own
 * properties are deliberately NOT pinned name-by-name: they are TS-private,
 * renamed by terser in every shipped artifact, and capability state
 * initialization legitimately moves between the base constructor and the
 * subclass constructor during the decomposition.
 *
 * ── DELIBERATE CHANGE, framework-slim tier-3 (`.omc/handoffs/fs-tier3.md`) ──
 * `useDefineForClassFields` is now `false` (−191 B min+gz on `/slim`), so a
 * class field is an own property only once something ASSIGNS it. `instanceId`
 * is assigned only by the discovery capability, which the root entry composes
 * back in and which `exposeGlobal: false` opts out of. The own-property
 * assertion below therefore SPLIT in two rather than losing a name:
 *   • `exposeGlobal: false` → the four always-assigned publics, `instanceId`
 *     ABSENT (it used to be present with value `undefined`);
 *   • `exposeGlobal: true`  → the same four plus `instanceId` LAST, which
 *     additionally pins the second consequence of the flag: own-property
 *     order is now constructor-assignment order, not declaration order.
 * Nothing else in this file moved: every prototype/descriptor assertion is
 * unaffected, because public members were never class fields.
 */

/** Every public method that must resolve on the prototype chain, never as an own prop. */
const PROTOTYPE_METHODS = [
  "init",
  "destroy",
  "on",
  // DELIBERATE EXTENSION, fs-dx2: `.with(installer)` is the composition pipe
  // and lives on the BASE class, so it is an ordinary prototype method and
  // the contract grows by exactly one name — nothing else in this file moves.
  "with",
  "t",
  "tRaw",
  "setLocaleAsync",
  "setFallbackLocale",
  "setDefaultParams",
  "setDefaultNamespace",
  "getDefaultNamespace",
  "getActiveNamespaces",
  "getFallbackLocales",
  "getLoadedLocales",
  "addTranslations",
  "getTranslations",
  "clearTranslations",
  "hasLocale",
  "hasTranslation",
  "addActiveNamespace",
  "addActiveNamespaces",
  "reportError",
  // capability methods extracted into /loader and /plugins
  "registerLoader",
  "getLoader",
  "reloadTranslations",
  "onLoadError",
  "use",
  "registerLocaleDetector",
  "getLanguageDetector",
  "onMissingKey",
  "registerPostProcessor",
  "setPluginData",
  "getPluginData",
] as const;

/** Accessors that must stay accessors on the prototype chain. */
const PROTOTYPE_ACCESSORS = [
  { name: "locale", writableAccessor: true },
  { name: "defaultParams", writableAccessor: false },
  { name: "configRevision", writableAccessor: false },
  { name: "isLoading", writableAccessor: false },
  { name: "isInitializing", writableAccessor: false },
  { name: "isInitialized", writableAccessor: false },
] as const;

/**
 * Public own properties every instance assigns, in constructor-assignment
 * order (which IS declaration order for these four).
 */
const PUBLIC_OWN_KEYS = ["translationCache", "apiKey", "collectContext", "devMode"] as const;

/** Assigned only by the discovery capability, and only when exposure is on. */
const DISCOVERY_OWN_KEY = "instanceId";

interface Found {
  descriptor: PropertyDescriptor;
  holder: object;
}

/**
 * Resolve a member the way the language does: walk the prototype chain. The
 * decomposition moves members between the base prototype and the subclass
 * prototype, which is invisible to consumers and must stay invisible here.
 */
function findOnPrototypeChain(instance: object, name: string): Found | undefined {
  let proto: object | null = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (descriptor) return { descriptor, holder: proto };
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

/**
 * Patch a member on `I18n.prototype` the way a consumer would, and restore the
 * exact previous state (own property vs. inherited) afterwards.
 */
function patchPrototype(name: string, impl: (...args: never[]) => unknown): () => void {
  const proto = I18n.prototype as unknown as Record<string, unknown>;
  const previous = Object.getOwnPropertyDescriptor(proto, name);
  proto[name] = impl;
  return () => {
    if (previous) Object.defineProperty(proto, name, previous);
    else delete proto[name];
  };
}

describe("root reflective contract (A11)", () => {
  it("resolves every public method on the prototype chain with class-method descriptors", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    for (const name of PROTOTYPE_METHODS) {
      const found = findOnPrototypeChain(i18n, name);
      expect(found, `${name} must resolve on the prototype chain`).toBeDefined();
      expect(typeof found!.descriptor.value, `${name} must be a function`).toBe("function");
      expect(
        {
          writable: found!.descriptor.writable,
          enumerable: found!.descriptor.enumerable,
          configurable: found!.descriptor.configurable,
        },
        `${name} descriptor`,
      ).toEqual({ writable: true, enumerable: false, configurable: true });
      expect(
        Object.prototype.hasOwnProperty.call(i18n, name),
        `${name} must not be an own property`,
      ).toBe(false);
    }
  });

  it("keeps accessors as non-enumerable prototype accessors", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    for (const { name, writableAccessor } of PROTOTYPE_ACCESSORS) {
      const found = findOnPrototypeChain(i18n, name);
      expect(found, `${name} must resolve on the prototype chain`).toBeDefined();
      const d = found!.descriptor;
      expect(typeof d.get, `${name} must have a getter`).toBe("function");
      expect(typeof d.set, `${name} setter`).toBe(writableAccessor ? "function" : "undefined");
      expect(d.enumerable, `${name} must be non-enumerable`).toBe(false);
      expect(d.configurable, `${name} must be configurable`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(i18n, name)).toBe(false);
    }
  });

  it("exposes exactly the public own properties and no methods", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });
    const ownKeys = Object.keys(i18n);

    // `useDefineForClassFields: false`: a field is an own property only once
    // assigned, so an instance that opted out of discovery has no
    // `instanceId` own property at all (pre-flag it was present, undefined).
    expect(ownKeys.filter((k) => !k.startsWith("_"))).toEqual([...PUBLIC_OWN_KEYS]);
    expect(Object.prototype.hasOwnProperty.call(i18n, DISCOVERY_OWN_KEY)).toBe(false);
    expect(i18n.instanceId).toBeUndefined();

    const members: string[] = [...PROTOTYPE_METHODS, ...PROTOTYPE_ACCESSORS.map((a) => a.name)];
    expect(ownKeys.filter((k) => members.includes(k))).toEqual([]);

    // A spread copy carries data only — never behavior.
    const spread = { ...i18n } as Record<string, unknown>;
    expect(Object.keys(spread).filter((k) => typeof spread[k] === "function")).toEqual([]);
  });

  it("appends instanceId in assignment order when discovery exposes the instance", () => {
    // The root entry composes discovery back in, so exposure still assigns
    // `instanceId` — and pins the flag's second consequence: own-property
    // order is constructor-assignment order, so the discovery key lands LAST,
    // after every field the base constructor assigned.
    const i18n = new I18n({ locale: "en", exposeGlobal: true, instanceId: "a11-probe" });

    expect(Object.keys(i18n).filter((k) => !k.startsWith("_"))).toEqual([
      ...PUBLIC_OWN_KEYS,
      DISCOVERY_OWN_KEY,
    ]);
    expect(i18n.instanceId).toBe("a11-probe");

    const d = Object.getOwnPropertyDescriptor(i18n, DISCOVERY_OWN_KEY)!;
    expect({
      writable: d.writable,
      enumerable: d.enumerable,
      configurable: d.configurable,
    }).toEqual({ writable: true, enumerable: true, configurable: true });
  });

  it("lets prototype patching intercept instance calls (base and capability members)", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });
    const calls: string[] = [];

    const restoreT = patchPrototype("t", function (this: I18n) {
      calls.push("t");
      return "patched";
    });
    const restoreRegisterLoader = patchPrototype("registerLoader", function (this: I18n) {
      calls.push("registerLoader");
    });

    try {
      expect(i18n.t("anything")).toBe("patched");
      i18n.registerLoader(async () => ({}));
      expect(calls).toEqual(["t", "registerLoader"]);
    } finally {
      restoreRegisterLoader();
      restoreT();
    }

    // Restoration is exact: the real implementations are back.
    expect(i18n.t("anything")).toBe("anything");
    expect(i18n.getLoader()).toBeUndefined();
    i18n.registerLoader(async () => ({}));
    expect(typeof i18n.getLoader()).toBe("function");
  });

  it("keeps the import-map registerLoader overload on the root subclass prototype", () => {
    const i18n = new I18n({ locale: "en", exposeGlobal: false });
    const own = Object.getOwnPropertyDescriptor(I18n.prototype, "registerLoader");

    expect(own, "root subclass must own registerLoader (import-map overload)").toBeDefined();
    expect(own!.enumerable).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(i18n, "registerLoader")).toBe(false);
  });
});
