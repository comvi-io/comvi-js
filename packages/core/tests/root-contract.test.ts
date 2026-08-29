import { describe, it, expect } from "vitest";
import { createI18n, I18n } from "../src";
// The internal composite (`src/core/full.ts`): the batteries-included host the
// CDN global ships and `@comvi/next`'s builder mirrors.
import { I18n as ComposedI18n } from "../src/core/full";

/**
 * The REFLECTIVE contract of the published surface. Consumers spy on, patch,
 * enumerate and feature-detect the class, so its shape is as much a contract as
 * its behaviour, and the capability decomposition must not disturb it.
 *
 * On `Object.keys`: what is pinned is the PUBLIC observable shape — the exact
 * public own-property list, plus the absence of any public METHOD from the
 * own-property set (the failure mode an own-property attach path would
 * introduce if it leaked onto the host). The `_`-prefixed own properties are
 * deliberately NOT pinned by name: they are TS-private, renamed by terser in
 * every shipped artifact, and capability state may legitimately move between
 * the base and subclass constructors.
 *
 * `useDefineForClassFields` is `false`, so a class field becomes an own
 * property only once something ASSIGNS it. `instanceId` is assigned only by the
 * discovery capability, which `exposeGlobal: false` opts out of — hence two
 * own-property assertions rather than one:
 *   • `exposeGlobal: false` → the four always-assigned publics, `instanceId`
 *     ABSENT;
 *   • `exposeGlobal: true`  → the same four plus `instanceId` LAST, which also
 *     pins the flag's second consequence: own-property order is
 *     constructor-ASSIGNMENT order, not declaration order.
 *
 * Two shapes are pinned, because the root is the base host: `base root …` for
 * the published `@comvi/core` surface, `composed host …` for the composite.
 */

/**
 * Public methods that must resolve on the BASE prototype chain, never as an
 * own property.
 */
const BASE_PROTOTYPE_METHODS = [
  "init",
  "destroy",
  "on",
  // `.with(installer)` is the composition pipe and lives on the BASE class, so
  // it is an ordinary prototype method like any other.
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
  "reportError",
] as const;

/**
 * The capability methods the COMPOSITE adds — through `extends` (loader,
 * including the namespace-activation trio that only means something when
 * something can load) and through the prototype descriptors `core/full.ts`
 * installs (plugin host). Absent from the base root by module graph, not by a
 * flag.
 */
const CAPABILITY_PROTOTYPE_METHODS = [
  "registerLoader",
  "getLoader",
  "reloadTranslations",
  "addActiveNamespace",
  "addActiveNamespaces",
  "onLoadError",
  "use",
  "registerLocaleDetector",
  "getLanguageDetector",
  "onMissingKey",
  "registerPostProcessor",
  "setPluginData",
  "getPluginData",
] as const;

const COMPOSED_PROTOTYPE_METHODS = [
  ...BASE_PROTOTYPE_METHODS,
  ...CAPABILITY_PROTOTYPE_METHODS,
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
 * Patch a member on a prototype the way a consumer would, and restore the
 * exact previous state (own property vs. inherited) afterwards.
 */
function patchPrototype(
  proto: object,
  name: string,
  impl: (...args: never[]) => unknown,
): () => void {
  const target = proto as Record<string, unknown>;
  const previous = Object.getOwnPropertyDescriptor(target, name);
  target[name] = impl;
  return () => {
    if (previous) Object.defineProperty(target, name, previous);
    else delete target[name];
  };
}

/** Assert the class-method descriptor contract for one prototype member. */
function expectPrototypeMethod(instance: object, name: string): void {
  const found = findOnPrototypeChain(instance, name);
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
    Object.prototype.hasOwnProperty.call(instance, name),
    `${name} must not be an own property`,
  ).toBe(false);
}

/** Assert the accessor contract for one prototype accessor. */
function expectPrototypeAccessor(instance: object, name: string, writableAccessor: boolean): void {
  const found = findOnPrototypeChain(instance, name);
  expect(found, `${name} must resolve on the prototype chain`).toBeDefined();
  const d = found!.descriptor;
  expect(typeof d.get, `${name} must have a getter`).toBe("function");
  expect(typeof d.set, `${name} setter`).toBe(writableAccessor ? "function" : "undefined");
  expect(d.enumerable, `${name} must be non-enumerable`).toBe(false);
  expect(d.configurable, `${name} must be configurable`).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(instance, name)).toBe(false);
}

describe("base root reflective contract (A11)", () => {
  it("resolves every base public method on the prototype chain with class-method descriptors", () => {
    const i18n = new I18n({ locale: "en" });

    for (const name of BASE_PROTOTYPE_METHODS) expectPrototypeMethod(i18n, name);
  });

  it("keeps accessors as non-enumerable prototype accessors", () => {
    const i18n = new I18n({ locale: "en" });

    for (const { name, writableAccessor } of PROTOTYPE_ACCESSORS) {
      expectPrototypeAccessor(i18n, name, writableAccessor);
    }
  });

  it("carries NO capability member — they are absent by module graph", () => {
    const i18n = new I18n({ locale: "en" }) as unknown as Record<string, unknown>;

    for (const name of CAPABILITY_PROTOTYPE_METHODS) {
      expect(i18n[name], `${name} must be absent from the base host`).toBeUndefined();
    }
  });

  it("exposes exactly the public own properties, without instanceId, and no methods", () => {
    const i18n = new I18n({ locale: "en" });
    const ownKeys = Object.keys(i18n);

    // Discovery is an installer away, so the base host never assigns
    // `instanceId` — with `useDefineForClassFields: false` it is not an own
    // property at all, on ANY option combination.
    expect(ownKeys.filter((k) => !k.startsWith("_"))).toEqual([...PUBLIC_OWN_KEYS]);
    expect(Object.prototype.hasOwnProperty.call(i18n, DISCOVERY_OWN_KEY)).toBe(false);
    expect(i18n.instanceId).toBeUndefined();

    const exposed = new I18n({ locale: "en", exposeGlobal: true, instanceId: "a11-probe" });
    expect(Object.keys(exposed).filter((k) => !k.startsWith("_"))).toEqual([...PUBLIC_OWN_KEYS]);
    expect(exposed.instanceId).toBeUndefined();

    const members: string[] = [
      ...BASE_PROTOTYPE_METHODS,
      ...PROTOTYPE_ACCESSORS.map((a) => a.name),
    ];
    expect(ownKeys.filter((k) => members.includes(k))).toEqual([]);

    // A spread copy carries data only — never behavior.
    const spread = { ...i18n } as Record<string, unknown>;
    expect(Object.keys(spread).filter((k) => typeof spread[k] === "function")).toEqual([]);
  });

  it("publishes a ONE-ARGUMENT construct signature that shares the base prototype", () => {
    // The published binding IS the base class; the narrowed construct type only
    // keeps the internal compiler parameter out of the emitted declaration. At
    // runtime: one prototype, one `instanceof`, one shape.
    const viaClass = new I18n({ locale: "en" });
    const viaFactory = createI18n({ locale: "en" });

    expect(Object.getPrototypeOf(viaFactory)).toBe(Object.getPrototypeOf(viaClass));
    expect(viaFactory instanceof (I18n as unknown as new () => object)).toBe(true);
    expect(I18n.length, "the construct signature takes exactly one argument").toBe(1);

    // `with` is a plain non-enumerable prototype method, not an own property.
    expectPrototypeMethod(viaFactory, "with");
    expect(viaFactory.with((host) => host)).toBe(viaFactory);
  });

  it("lets prototype patching intercept instance calls", () => {
    const i18n = new I18n({ locale: "en" });
    const calls: string[] = [];

    const restoreT = patchPrototype(I18n.prototype, "t", function (this: I18n) {
      calls.push("t");
      return "patched";
    });

    try {
      expect(i18n.t("anything")).toBe("patched");
      expect(calls).toEqual(["t"]);
    } finally {
      restoreT();
    }

    // Restoration is exact: the real implementation is back.
    expect(i18n.t("anything")).toBe("anything");
  });
});

describe("composed host reflective contract (A11)", () => {
  it("resolves every public method on the prototype chain with class-method descriptors", () => {
    const i18n = new ComposedI18n({ locale: "en", exposeGlobal: false });

    for (const name of COMPOSED_PROTOTYPE_METHODS) expectPrototypeMethod(i18n, name);
  });

  it("keeps accessors as non-enumerable prototype accessors", () => {
    const i18n = new ComposedI18n({ locale: "en", exposeGlobal: false });

    for (const { name, writableAccessor } of PROTOTYPE_ACCESSORS) {
      expectPrototypeAccessor(i18n, name, writableAccessor);
    }
  });

  it("exposes exactly the public own properties and no methods", () => {
    const i18n = new ComposedI18n({ locale: "en", exposeGlobal: false });
    const ownKeys = Object.keys(i18n);

    // `useDefineForClassFields: false`: a field is an own property only once
    // assigned, so an instance that opted out of discovery has no `instanceId`
    // own property at all.
    expect(ownKeys.filter((k) => !k.startsWith("_"))).toEqual([...PUBLIC_OWN_KEYS]);
    expect(Object.prototype.hasOwnProperty.call(i18n, DISCOVERY_OWN_KEY)).toBe(false);
    expect(i18n.instanceId).toBeUndefined();

    const members: string[] = [
      ...COMPOSED_PROTOTYPE_METHODS,
      ...PROTOTYPE_ACCESSORS.map((a) => a.name),
    ];
    expect(ownKeys.filter((k) => members.includes(k))).toEqual([]);

    // A spread copy carries data only — never behavior.
    const spread = { ...i18n } as Record<string, unknown>;
    expect(Object.keys(spread).filter((k) => typeof spread[k] === "function")).toEqual([]);
  });

  it("appends instanceId in assignment order when discovery exposes the instance", () => {
    // Discovery initializes LAST, and own-property order is
    // constructor-assignment order — so the discovery key lands after every
    // field the base constructor assigned.
    const i18n = new ComposedI18n({ locale: "en", exposeGlobal: true, instanceId: "a11-probe" });

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
    const i18n = new ComposedI18n({ locale: "en", exposeGlobal: false });
    const calls: string[] = [];

    const restoreT = patchPrototype(ComposedI18n.prototype, "t", function (this: ComposedI18n) {
      calls.push("t");
      return "patched";
    });
    const restoreRegisterLoader = patchPrototype(
      ComposedI18n.prototype,
      "registerLoader",
      function (this: ComposedI18n) {
        calls.push("registerLoader");
      },
    );

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

  it("keeps the import-map registerLoader overload on the composite prototype", () => {
    const i18n = new ComposedI18n({ locale: "en", exposeGlobal: false });
    const own = Object.getOwnPropertyDescriptor(ComposedI18n.prototype, "registerLoader");

    expect(own, "the composite must own registerLoader (import-map overload)").toBeDefined();
    expect(own!.enumerable).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(i18n, "registerLoader")).toBe(false);
  });
});
