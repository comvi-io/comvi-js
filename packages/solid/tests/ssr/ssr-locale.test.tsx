/**
 * W4/Q4 — `<I18nProvider ssrLocale>` seeds the render locale, the way vue's
 * option of that name does: the host adopts it before the locale signal is
 * seeded, so `renderToString` and the hydrating client paint the same locale.
 *
 * Both halves are real: the server HTML comes out of solid's server build
 * compiled `generate: "ssr"` (see `vitest.config.ts`), and `hydrate()` runs on
 * that exact string from the browser build. Separate host instances per half,
 * because a server process and a browser never share one.
 */
import { beforeAll, describe, it, expect, beforeEach } from "vitest";
import { render } from "@solidjs/testing-library";
import { createI18n } from "../../src";
import { App } from "./app";

const catalog = {
  en: { greeting: "Hello" },
  fr: { greeting: "Bonjour" },
};

const host = () => createI18n({ locale: "en", messages: catalog, exposeGlobal: false });

const renderOnServer = async (props: Parameters<typeof App>[0]) =>
  (await import("./render.server")).renderApp(props);

describe("solid SSR — ssrLocale", () => {
  // The server module graph is transformed on first import. Under a full-repo
  // run that cold transform alone can exceed the 5 s test budget, so it is
  // paid once here, outside any test.
  beforeAll(async () => {
    await import("./render.server");
  }, 30_000);

  beforeEach(() => {
    // What `generateHydrationScript()` puts in the document head; solid's
    // `hydrate()` reads it, and no test page runs that script.
    (globalThis as { _$HY?: unknown })._$HY = {
      events: [],
      completed: new WeakSet(),
      r: {},
      fe() {},
    };
  });

  it("renders the server HTML in the seeded locale, not the host's", async () => {
    const html = await renderOnServer({ i18n: host(), ssrLocale: "fr" });

    expect(html).toContain('data-locale="fr"');
    expect(html).toContain("Bonjour");
  });

  it("leaves the host locale alone when it is not passed", async () => {
    const html = await renderOnServer({ i18n: host() });

    expect(html).toContain('data-locale="en"');
    expect(html).toContain("Hello");
  });

  it("adopts the locale onto the host, so t() and locale() cannot disagree", async () => {
    const i18n = host();
    await renderOnServer({ i18n, ssrLocale: "fr" });

    expect(i18n.locale).toBe("fr");
  });

  it("hydrates the server paint without a mismatch: same nodes, same text", async () => {
    const serverHtml = await renderOnServer({ i18n: host(), ssrLocale: "fr" });

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const serverNode = container.firstElementChild as HTMLElement & { __fromServer?: boolean };
    serverNode.__fromServer = true;

    const clientHost = host();
    render(() => <App i18n={clientHost} ssrLocale="fr" />, { container, hydrate: true });

    const hydrated = container.firstElementChild as HTMLElement & { __fromServer?: boolean };
    // Reused, not replaced: solid found the server node by its hydration key,
    // and it throws "Hydration Mismatch" when it cannot.
    expect(hydrated.__fromServer).toBe(true);
    expect(container.innerHTML).toBe(serverHtml);
    expect(container.textContent).toBe("Bonjour");
    expect(clientHost.locale).toBe("fr");

    // The paint SURVIVES the first reactive update, which is where a locale
    // the client never agreed with would have shown up.
    clientHost.addMessages({ fr: { unrelated: "x" } });
    expect(container.textContent).toBe("Bonjour");
  });

  it("without ssrLocale the hydrating client silently disagrees with the server paint", async () => {
    const serverHtml = await renderOnServer({ i18n: host(), ssrLocale: "fr" });
    expect(serverHtml).toContain("Bonjour");

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const clientHost = host();
    render(() => <App i18n={clientHost} />, { container, hydrate: true });

    // Hydration reuses the server's text node without rewriting it, so the
    // disagreement is invisible — until the first reactive update repaints in
    // the locale the client actually holds. That is the bug `ssrLocale` fixes.
    expect(clientHost.locale).toBe("en");
    expect(container.textContent).toBe("Bonjour");

    clientHost.addMessages({ fr: { unrelated: "x" } });
    expect(container.textContent).toBe("Hello");
  });
});
