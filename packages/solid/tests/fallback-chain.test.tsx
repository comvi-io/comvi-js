import { describe, it, expect } from "vitest";
import { render } from "solid-js/web";
import { I18nProvider, createI18n, useI18n } from "../src/index";

// `zz` is a well-formed tag no runtime ships data for, so it formats in its fallback.
const fr = new Intl.NumberFormat("fr").format(1234.5);

describe("@comvi/solid — formatters follow the fallback-locale chain", () => {
  it("formats in the fallback, an explicit locale stays single, and JSX follows setFallbackLocale", () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: "de", exposeGlobal: false });
    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <span>{api.formatNumber(1234.5)}</span>;
    };
    const container = document.createElement("div");
    const dispose = render(
      () => (
        <I18nProvider i18n={i18n} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("1.234,5");
    expect(api.formatNumber(1234.5, undefined, "fr")).toBe(fr);
    expect(api.formatNumber(1234.5, undefined, "zz")).toBe(
      new Intl.NumberFormat("zz").format(1234.5),
    );

    i18n.setFallbackLocale("fr");

    expect(container.textContent).toBe(fr);
    dispose();
  });
});
