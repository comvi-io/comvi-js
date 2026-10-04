/**
 * `ssrLocale` on an instance that has `@comvi/core/loader` composed, an active
 * default namespace and both catalogs cached. Here the locale setter goes
 * through the loader's `setLocale`, which awaits the namespace load before it
 * moves `locale` even on a cache hit, so the provider's synchronous write may
 * not be visible to the FIRST render. Both halves are checked: the server
 * string from `renderToString`, and a client render (hydrating that string).
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { loader } from "@comvi/core/loader";
import { createI18n } from "../../src";
import { App } from "./app";

const catalogs = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
};

/** `init()`ed at `en`, with the loader composed and both catalogs cached. */
const loadedInstance = async () => {
  const i18n = createI18n({ locale: "en", exposeGlobal: false }).use(
    loader({
      en: async () => catalogs.en,
      uk: async () => catalogs.uk,
    }),
  );
  await i18n.init();
  await i18n.reloadMessages("uk");
  expect(i18n.locale).toBe("en");
  expect(i18n.hasLocale("uk")).toBe(true);
  return i18n;
};

const renderOnServer = async (props: Parameters<typeof App>[0]) =>
  (await import("./render.server")).renderApp(props);

describe("solid SSR — ssrLocale with the loader composed", () => {
  beforeAll(async () => {
    await import("./render.server");
  }, 30_000);

  beforeEach(() => {
    (globalThis as { _$HY?: unknown })._$HY = {
      events: [],
      completed: new WeakSet(),
      r: {},
      fe() {},
    };
  });

  it("renders the server string in the ssrLocale on the first render", async () => {
    const html = await renderOnServer({ i18n: await loadedInstance(), ssrLocale: "uk" });

    expect(html).toContain('data-locale="uk"');
    expect(html).toContain("Привіт");
  });

  it("paints the ssrLocale on the first client render", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const i18n = await loadedInstance();

    render(() => <App i18n={i18n} ssrLocale="uk" />, { container });

    const span = container.querySelector("span")!;
    expect(span.getAttribute("data-locale")).toBe("uk");
    expect(span.textContent).toBe("Привіт");
  });

  it("hydrates the server string without a locale disagreement", async () => {
    const serverHtml = await renderOnServer({ i18n: await loadedInstance(), ssrLocale: "uk" });
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const clientInstance = await loadedInstance();

    render(() => <App i18n={clientInstance} ssrLocale="uk" />, { container, hydrate: true });

    expect(container.textContent).toBe("Привіт");
    // The first reactive update repaints in the locale the client holds.
    clientInstance.addMessages({ uk: { unrelated: "x" } });
    await Promise.resolve();
    expect(container.textContent).toBe("Привіт");
  });
});
