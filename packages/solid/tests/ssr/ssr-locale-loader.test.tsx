/**
 * `ssrLocale` on an instance with `@comvi/core/loader` composed.
 *
 * The provider writes `ssrLocale` to the instance and every reader (`t()`,
 * `<T>`, `locale()`, the formatters) mirrors the instance. So the first render
 * is in `ssrLocale` exactly when the instance can adopt it at once, which is
 * when that locale's catalogs are already loaded; otherwise the first render
 * is in the instance's current locale and nothing runs ahead of it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { loader } from "@comvi/core/loader";
import { createI18n } from "../../src";
import { LoaderApp } from "./loader-app";

const catalogs = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
};
const number = (locale: string) => new Intl.NumberFormat(locale).format(1234.5);

/** `init()`ed at `en` with the loader composed; `uk` is whatever the test passes. */
const instanceAtEn = async (uk: () => Promise<Record<string, string>>) => {
  const i18n = createI18n({ locale: "en", exposeGlobal: false, onError: () => {} }).use(
    loader({ en: async () => catalogs.en, uk }),
  );
  await i18n.init();
  expect(i18n.locale).toBe("en");
  return i18n;
};

/** Both catalogs loaded before the render. */
const instanceWithBothCached = async () => {
  const i18n = await instanceAtEn(async () => catalogs.uk);
  await i18n.reloadMessages("uk");
  expect(i18n.locale).toBe("en");
  expect(i18n.hasLocale("uk")).toBe(true);
  return i18n;
};

const renderOnServer = async (props: Parameters<typeof LoaderApp>[0]) =>
  (await import("./loader-render.server")).renderLoaderApp(props);

const mount = (i18n: Parameters<typeof LoaderApp>[0]["i18n"]) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(() => <LoaderApp i18n={i18n} ssrLocale="uk" />, { container });
  const part = (name: string) => container.querySelector(`[data-part="${name}"]`)!.textContent;
  return {
    read: () => ({
      locale: container.querySelector("p")!.getAttribute("data-locale"),
      t: part("t"),
      T: part("T"),
      number: part("number"),
    }),
  };
};

const allIn = (locale: "en" | "uk") => ({
  locale,
  t: catalogs[locale].greeting,
  T: catalogs[locale].greeting,
  number: number(locale),
});

describe("solid SSR — ssrLocale with the loader composed", () => {
  beforeAll(async () => {
    await import("./loader-render.server");
  }, 30_000);

  describe("both catalogs already loaded", () => {
    it("renders the server string in ssrLocale: t(), <T>, locale() and the formatter", async () => {
      const html = await renderOnServer({ i18n: await instanceWithBothCached(), ssrLocale: "uk" });

      expect(html).toContain('data-locale="uk"');
      expect(html.match(/Привіт/g)).toHaveLength(2);
      expect(html).not.toContain("Hello");
      expect(html).toContain(number("uk"));
    });

    it("paints ssrLocale on the first client render", async () => {
      const i18n = await instanceWithBothCached();

      const view = mount(i18n);

      expect(i18n.locale).toBe("uk");
      expect(view.read()).toEqual(allIn("uk"));
    });
  });

  describe("the ssrLocale catalog is not loaded", () => {
    it("renders the server string in the instance's current locale, with nothing ahead of it", async () => {
      const i18n = await instanceAtEn(() => new Promise(() => {}));

      const html = await renderOnServer({ i18n, ssrLocale: "uk" });

      expect(i18n.locale).toBe("en");
      expect(html).toContain('data-locale="en"');
      expect(html.match(/Hello/g)).toHaveLength(2);
      expect(html).toContain(number("en"));
    });

    it("stays on the first render's locale, then switches when the load completes", async () => {
      let deliver!: (catalog: Record<string, string>) => void;
      const i18n = await instanceAtEn(() => new Promise((resolve) => (deliver = resolve)));

      const view = mount(i18n);
      expect(view.read()).toEqual(allIn("en"));

      deliver(catalogs.uk);
      await expect.poll(() => i18n.locale).toBe("uk");

      expect(view.read()).toEqual(allIn("uk"));
    });

    it("agrees with the instance after the load fails", async () => {
      const i18n = await instanceAtEn(async () => {
        throw new Error("offline");
      });
      const failed = new Promise<void>((resolve) =>
        i18n.on("loadError", ({ namespace }) => {
          if (namespace === "locale-change") resolve();
        }),
      );

      const view = mount(i18n);
      expect(view.read()).toEqual(allIn("en"));
      await failed;

      expect(i18n.locale).toBe("en");
      expect(view.read()).toEqual(allIn("en"));
      // The paint survives a reactive update.
      i18n.addMessages({ en: { unrelated: "x" } });
      expect(view.read()).toEqual(allIn("en"));
    });

    it("agrees with the instance after a superseding setLocale('en')", async () => {
      let deliver!: (catalog: Record<string, string>) => void;
      const i18n = await instanceAtEn(() => new Promise((resolve) => (deliver = resolve)));
      const view = mount(i18n);

      await i18n.setLocale("en");
      deliver(catalogs.uk);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(i18n.locale).toBe("en");
      expect(view.read()).toEqual(allIn("en"));
    });
  });
});
