/**
 * Characterization tests for T.svelte hasExplicitProp forwarding behavior.
 *
 * These tests pin the CURRENT behavior of the `$$props`-based `hasExplicitProp`
 * check so that the Svelte 5 runes migration can verify it preserves the same
 * semantics without regression.
 *
 * Core contract:
 *   - ns / locale / fallback / raw are forwarded into transportParams ONLY when
 *     explicitly provided as props; when omitted, the value in `params.*` wins.
 *   - `hasTranslation` uses the same forwarded locale/ns for its look-up.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import TPropForwardingWrapper from "./TPropForwarding.test.svelte";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import type { TranslationResult } from "@comvi/core";

// ---------------------------------------------------------------------------
// Shared fake i18n factory
// ---------------------------------------------------------------------------

const createI18n = (): FakeI18n => {
  const fake = new FakeI18n({ language: "en", defaultNamespace: "default" });
  fake.addTranslations({ en: { probe: "x" }, fr: { probe: "x" }, "fr:admin": { probe: "x" } });
  fake.tImplementation = (key, params): TranslationResult => {
    // Echo reserved params so assertions can inspect what was forwarded
    return `ns=${String(params?.ns)}|locale=${String(params?.locale)}|fallback=${String(
      params?.fallback,
    )}|raw=${String(params?.raw)}`;
  };
  return fake;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WrapperProps = {
  i18n: ReturnType<FakeI18n["asI18n"]>;
  i18nKey: string;
  params?: Record<string, unknown>;
  passNs?: boolean;
  ns?: string;
  passLocale?: boolean;
  locale?: string;
  passFallback?: boolean;
  fallback?: string;
  passRaw?: boolean;
  raw?: boolean;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("T.svelte hasExplicitProp forwarding characterization", () => {
  let fake: FakeI18n;
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    fake = createI18n();
    component = null;
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    target.remove();
  });

  function mountWrapper(props: WrapperProps) {
    component = mount(TPropForwardingWrapper, { target, props });
  }

  // -------------------------------------------------------------------------
  // 1. When props are NOT passed, params.* values are used
  // -------------------------------------------------------------------------

  describe("when ns/locale/fallback/raw are NOT passed as props", () => {
    it("does NOT inject ns into transportParams — params.ns reaches tRaw", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { ns: "admin" },
        // passNs deliberately omitted (defaults false)
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith("probe", expect.objectContaining({ ns: "admin" }));
    });

    it("does NOT inject locale into transportParams — params.locale reaches tRaw", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { locale: "fr" },
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({ locale: "fr" }),
      );
    });

    it("does NOT inject fallback into transportParams — params.fallback reaches tRaw", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { fallback: "Default text" },
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({ fallback: "Default text" }),
      );
    });

    it("does NOT inject raw into transportParams — params.raw reaches tRaw", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { raw: true },
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith("probe", expect.objectContaining({ raw: true }));
    });

    it("passes all four via params when none forwarded as props", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { ns: "admin", locale: "fr", fallback: "FB", raw: true },
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({ ns: "admin", locale: "fr", fallback: "FB", raw: true }),
      );
    });

    it("uses params.locale and params.ns for hasTranslation look-up", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { locale: "fr", ns: "admin" },
      });

      expect(fake.hasTranslation).toHaveBeenCalledWith("probe", "fr", "admin", true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. When props ARE passed, they override params.*
  // -------------------------------------------------------------------------

  describe("when ns/locale/fallback/raw ARE passed as props", () => {
    it("prop ns overrides params.ns in transportParams", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { ns: "from-params" },
        passNs: true,
        ns: "from-prop",
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({ ns: "from-prop" }),
      );
    });

    it("prop locale overrides params.locale in transportParams", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { locale: "de" },
        passLocale: true,
        locale: "fr",
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({ locale: "fr" }),
      );
    });

    it("prop fallback overrides params.fallback in transportParams", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { fallback: "from-params" },
        passFallback: true,
        fallback: "from-prop",
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({ fallback: "from-prop" }),
      );
    });

    it("prop raw overrides params.raw in transportParams", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { raw: false },
        passRaw: true,
        raw: true,
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith("probe", expect.objectContaining({ raw: true }));
    });

    it("all four props forwarded simultaneously override all four params values", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { ns: "p-ns", locale: "de", fallback: "p-fb", raw: false },
        passNs: true,
        ns: "prop-ns",
        passLocale: true,
        locale: "fr",
        passFallback: true,
        fallback: "prop-fb",
        passRaw: true,
        raw: true,
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({
          ns: "prop-ns",
          locale: "fr",
          fallback: "prop-fb",
          raw: true,
        }),
      );
    });

    it("prop locale and prop ns are used for hasTranslation look-up", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { locale: "de", ns: "other" },
        passLocale: true,
        locale: "fr",
        passNs: true,
        ns: "admin",
      });

      expect(fake.hasTranslation).toHaveBeenCalledWith("probe", "fr", "admin", true);
    });

    // NOTE: passing ns={undefined} explicitly cannot be reliably distinguished from
    // "prop omitted" — prepareTranslation forwards a reserved prop only when it is
    // not `undefined` (same rule as the vue/react/solid wrappers), so params.ns wins.
    // This edge case is intentionally not tested; the meaningful contract is that
    // a concrete string value (e.g. ns="admin") overrides params.ns.
    it("forwarded prop ns with a concrete value overrides params.ns", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { ns: "from-params" },
        passNs: true,
        ns: "explicit-ns",
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({ ns: "explicit-ns" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Non-reserved params keys are always forwarded unaffected
  // -------------------------------------------------------------------------

  describe("non-reserved params keys are always forwarded", () => {
    it("custom param values reach tRaw regardless of which props are passed", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { name: "Alice", count: 3 },
      });

      expect(fake.tRaw).toHaveBeenLastCalledWith(
        "probe",
        expect.objectContaining({ name: "Alice", count: 3 }),
      );
    });
  });
});
