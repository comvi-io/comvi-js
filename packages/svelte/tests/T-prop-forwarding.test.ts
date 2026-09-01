/**
 * `ns` / `locale` / `fallback` / `raw` reach `transportParams` ONLY when
 * explicitly passed as props; when omitted, the value in `params.*` wins. And
 * `hasTranslation` looks up against the same forwarded locale/ns.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import TPropForwardingWrapper from "./TPropForwarding.test.svelte";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

const createI18n = (): FakeI18n => {
  const fake = new FakeI18n({ language: "en", defaultNamespace: "default" });
  fake.addTranslations({ en: { probe: "x" }, fr: { probe: "x" }, "fr:admin": { probe: "x" } });
  return fake;
};

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

  describe("when ns/locale/fallback/raw are NOT passed as props", () => {
    it("does NOT inject ns into transportParams — params.ns reaches tRaw", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { ns: "admin" },
        // passNs deliberately omitted.
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

  describe("when ns/locale/fallback/raw ARE passed as props", () => {
    it("prop ns overrides params.ns in transportParams", () => {
      mountWrapper({
        i18n: fake.asI18n(),
        i18nKey: "probe",
        params: { ns: "from-params" },
        passNs: true,
        ns: "from-prop",
      });

      // `ns={undefined}` is deliberately not covered: `prepareTranslation`
      // forwards a reserved prop only when it is not `undefined` (the rule in
      // all four wrappers), so the contract is that a CONCRETE value wins.
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
  });

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
