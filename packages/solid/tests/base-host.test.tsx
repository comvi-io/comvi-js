/**
 * @comvi/solid on the BASE host its single entry builds.
 *
 * This is the D′ endpoint: the host implements `WrapperI18nHost` and nothing
 * more. Everything `useI18n()` still returns must work on it, and nothing the
 * wrapper does at render time may touch a loader/plugin member — a single
 * capability closure reached from the returned bag would blow up here.
 *
 * The constructor comes from `../src/index` on purpose: `@comvi/solid` is the
 * one specifier an app names, and it re-exports core's own base `createI18n`
 * by name, so this suite runs against exactly what an app gets.
 *
 * The loud-error side of the contract (exact dev AND prod messages) lives in
 * tests/js-contract/, which runs against the published dist under both build
 * conditions.
 */
import { describe, it, expect } from "vitest";
import { render } from "solid-js/web";
import { attachLoader, createI18n } from "../src/index";
import type { WrapperI18nHost } from "@comvi/core";
import { I18nProvider } from "../src/context";
import { useI18n } from "../src/useI18n";
import { T } from "../src/T";

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
  const container = document.createElement("div");
  const dispose = render(
    () => (
      <I18nProvider i18n={i18n} autoInit={false}>
        {Probe() as never}
      </I18nProvider>
    ),
    container,
  );
  return { container, dispose };
}

function useI18nUnder(i18n: WrapperI18nHost) {
  let api!: ReturnType<typeof useI18n>;
  const { container, dispose } = mount(i18n, () => {
    const Probe = () => {
      api = useI18n();
      return <div />;
    };
    return <Probe />;
  });
  return { api, container, dispose };
}

describe("solid on a base host", () => {
  it("renders translations through useI18n()", () => {
    const i18n = makeHost();
    const { api, dispose } = useI18nUnder(i18n);

    expect(api.t("greeting" as never, { name: "Ada" } as never)).toBe("Hello, Ada!");
    expect(api.locale()).toBe("en");
    expect(api.dir()).toBe("ltr");

    dispose();
  });

  it("exposes only the host-safe bag — the four capability members are gone", () => {
    const i18n = makeHost();
    const { api, dispose } = useI18nUnder(i18n);

    for (const name of ["t", "tRaw", "setLocale", "addTranslations", "on", "reportError"]) {
      expect(typeof (api as unknown as Record<string, unknown>)[name]).toBe("function");
    }
    for (const name of [
      "addActiveNamespace",
      "reloadTranslations",
      "onLoadError",
      "onMissingKey",
    ]) {
      expect(name in api).toBe(false);
    }

    dispose();
  });

  it("tracks a locale change driven through the host", async () => {
    const i18n = makeHost();
    const container = document.createElement("div");
    const dispose = render(
      () => (
        <I18nProvider i18n={i18n} autoInit={false}>
          {(() => {
            const Probe = () => {
              const { t, locale } = useI18n();
              return (
                <div>
                  {t("greeting" as never, { name: "Ada" } as never)}|{locale()}
                </div>
              );
            };
            return <Probe />;
          })()}
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("Hello, Ada!|en");

    await i18n.setLocaleAsync("fr");
    expect(container.textContent).toBe("Bonjour, Ada !|fr");

    dispose();
  });

  it("formats through the bag's Intl helpers", () => {
    const i18n = makeHost();
    const { api, dispose } = useI18nUnder(i18n);

    expect(api.formatNumber(1234.5)).toBe(new Intl.NumberFormat("en").format(1234.5));
    expect(api.formatCurrency(10, "USD")).toContain("10");

    dispose();
  });

  it("switches locale through the bag's setLocale", async () => {
    const i18n = makeHost();
    const { api, dispose } = useI18nUnder(i18n);

    await api.setLocale("fr");
    expect(i18n.locale).toBe("fr");

    dispose();
  });

  it("renders <T> with tag interpolation (per-call extension, no ambient registration)", () => {
    const i18n = makeHost();
    const container = document.createElement("div");
    const dispose = render(
      () => (
        <I18nProvider i18n={i18n} autoInit={false}>
          <T i18nKey={"rich" as never} components={{ link: "a" }} />
        </I18nProvider>
      ),
      container,
    );

    expect(container.querySelector("a")).not.toBeNull();
    expect(container.textContent).toBe("Click here");

    dispose();
  });

  it("adds translations at runtime without a loader", () => {
    const i18n = makeHost();
    const { api, dispose } = useI18nUnder(i18n);

    api.addTranslations({ en: { late: "Late binding" } });
    expect(api.t("late" as never)).toBe("Late binding");

    dispose();
  });
});

describe("solid on base + attachLoader (composed host)", () => {
  it("keeps useI18n()'s bag identical to the base one", () => {
    const bare = useI18nUnder(makeHost());
    const composed = useI18nUnder(attachLoader(makeHost()));

    expect(Object.keys(composed.api).sort()).toEqual(Object.keys(bare.api).sort());

    bare.dispose();
    composed.dispose();
  });
});
