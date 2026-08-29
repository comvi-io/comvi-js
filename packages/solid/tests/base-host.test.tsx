/**
 * `@comvi/solid` on the BASE host — a host that implements `WrapperI18nHost`
 * and nothing more. Nothing the wrapper does at render time may touch a
 * loader/plugin member: one capability closure reached from the returned bag
 * would blow up here.
 *
 * The loud-error half of the contract (exact dev AND prod messages) lives in
 * tests/js-contract/, against the published dist under both build conditions.
 */
import { describe, it, expect } from "vitest";
import { attachLoader, createI18n } from "../src/index";
import type { WrapperI18nHost } from "@comvi/core";
import { I18nProvider } from "../src/context";
import { useI18n } from "../src/useI18n";
import { T } from "../src/T";
import { renderSolid } from "./test-utils";

const makeHost = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: {
      en: { greeting: "Hello, {name}!", rich: "Click <link>here</link>" },
      fr: { greeting: "Bonjour, {name} !", rich: "Cliquez <link>ici</link>" },
    },
  });

function mount(i18n: WrapperI18nHost, Probe: () => unknown) {
  return renderSolid(() => (
    <I18nProvider i18n={i18n} autoInit={false}>
      {Probe() as never}
    </I18nProvider>
  ));
}

function useI18nUnder(i18n: WrapperI18nHost) {
  let api!: ReturnType<typeof useI18n>;
  const container = mount(i18n, () => {
    const Probe = () => {
      api = useI18n();
      return <div />;
    };
    return <Probe />;
  });
  return { api, container };
}

const HOST_SAFE_MEMBERS = ["t", "tRaw", "setLocale", "addTranslations", "on", "reportError"];
const CAPABILITY_MEMBERS = [
  "addActiveNamespace",
  "reloadTranslations",
  "onLoadError",
  "onMissingKey",
];

describe("solid on a base host", () => {
  it("renders translations through useI18n()", () => {
    const i18n = makeHost();
    const { api } = useI18nUnder(i18n);

    expect(api.t("greeting" as never, { name: "Ada" } as never)).toBe("Hello, Ada!");
    expect(api.locale()).toBe("en");
    expect(api.dir()).toBe("ltr");
  });

  it("exposes only the host-safe bag — the four capability members are gone", () => {
    const i18n = makeHost();
    const { api } = useI18nUnder(i18n);

    const present = CAPABILITY_MEMBERS.filter((name) => name in api);

    expect(present).toEqual([]);
  });

  it("exposes every host-safe member of the bag as a callable", () => {
    const i18n = makeHost();
    const { api } = useI18nUnder(i18n);

    const bag = api as unknown as Record<string, unknown>;
    const missing = HOST_SAFE_MEMBERS.filter((name) => typeof bag[name] !== "function");

    expect(missing).toEqual([]);
  });

  it("tracks a locale change driven through the host", async () => {
    const i18n = makeHost();
    const container = mount(i18n, () => {
      const Probe = () => {
        const { t, locale } = useI18n();
        return (
          <div>
            {t("greeting" as never, { name: "Ada" } as never)}|{locale()}
          </div>
        );
      };
      return <Probe />;
    });

    expect(container.textContent).toBe("Hello, Ada!|en");

    await i18n.setLocaleAsync("fr");

    expect(container.textContent).toBe("Bonjour, Ada !|fr");
  });

  it("formats through the bag's Intl helpers", () => {
    const i18n = makeHost();
    const { api } = useI18nUnder(i18n);

    expect(api.formatNumber(1234.5)).toBe("1,234.5");
    expect(api.formatCurrency(10, "USD")).toBe("$10.00");
  });

  it("switches locale through the bag's setLocale", async () => {
    const i18n = makeHost();
    const { api } = useI18nUnder(i18n);

    await api.setLocale("fr");

    expect(i18n.locale).toBe("fr");
  });

  it("renders <T> with tag interpolation (per-call extension, no ambient registration)", () => {
    const i18n = makeHost();

    const container = renderSolid(() => (
      <I18nProvider i18n={i18n} autoInit={false}>
        <T i18nKey={"rich" as never} components={{ link: "a" }} />
      </I18nProvider>
    ));

    expect(container.querySelector("a")).not.toBeNull();
    expect(container.textContent).toBe("Click here");
  });

  it("adds translations at runtime without a loader", () => {
    const i18n = makeHost();
    const { api } = useI18nUnder(i18n);

    api.addTranslations({ en: { late: "Late binding" } });

    expect(api.t("late" as never)).toBe("Late binding");
  });
});

describe("solid on base + attachLoader (composed host)", () => {
  it("keeps useI18n()'s bag identical to the base one", () => {
    const bare = useI18nUnder(makeHost());
    const composed = useI18nUnder(attachLoader(makeHost()));

    expect(Object.keys(composed.api).sort()).toEqual(Object.keys(bare.api).sort());
  });
});
