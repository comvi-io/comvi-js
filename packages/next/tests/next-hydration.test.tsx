/**
 * Verifies:
 *  - renderToString produces locale-specific text (setup runs before the
 *    inner React provider renders descendants)
 *  - hydrateRoot of the SSR output emits no console.error/warn
 *  - Boundary: no instance-locale mutation outside `syncLocaleSafely` in
 *    `next/client/I18nProvider.tsx` (a future refactor that reintroduces
 *    render-time mutation will fail this test)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";

import { createI18n, T } from "@comvi/react";
import { I18nProvider } from "../src/client/I18nProvider";

function makeProviderTree(locale: string, messages: Record<string, Record<string, string>>) {
  // createI18n requires SOMETHING valid; we pass placeholders and let the
  // provider sync locale + messages via the lazy initializer on render.
  const i18n = createI18n({ locale: "placeholder", translation: { placeholder: {} } });
  return (
    <I18nProvider i18n={i18n} locale={locale} messages={messages} autoInit={false}>
      <span data-testid="greeting">
        <T i18nKey={"greeting" as never} />
      </span>
    </I18nProvider>
  );
}

describe("Next <I18nProvider> SSR + hydration", () => {
  it("renderToString emits the correct locale-specific text", () => {
    const tree = makeProviderTree("fr", { fr: { greeting: "Bonjour" } });
    const html = renderToString(tree);
    expect(html).toContain("Bonjour");
  });

  it("renderToString for a different locale emits the matching text", () => {
    const tree = makeProviderTree("de", { de: { greeting: "Hallo" } });
    const html = renderToString(tree);
    expect(html).toContain("Hallo");
  });

  describe("hydrateRoot — zero console warnings", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it("hydrating the SSR output emits no error / warning calls", async () => {
      const messages = { fr: { greeting: "Bonjour" } };
      const tree = makeProviderTree("fr", messages);

      const html = renderToString(tree);
      expect(html).toContain("Bonjour");

      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);

      const clientTree = makeProviderTree("fr", messages);
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, clientTree);
      });

      expect(container.textContent).toContain("Bonjour");
      // A hydration mismatch would emit console.error; neither should fire.
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it("hydrating an alternative locale also produces no warnings", async () => {
      const messages = { de: { greeting: "Hallo" } };
      const tree = makeProviderTree("de", messages);

      const html = renderToString(tree);
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);

      const clientTree = makeProviderTree("de", messages);
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, clientTree);
      });

      expect(container.textContent).toContain("Hallo");
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });
  });

  describe("Architectural boundary — no render-time i18n.locale mutation", () => {
    it("`i18n.locale =` only appears inside the syncLocaleSafely helper", () => {
      const source = readFileSync(resolve(__dirname, "../src/client/I18nProvider.tsx"), "utf8");
      // Strip out the syncLocaleSafely function body (the one place this
      // mutation is allowed to live).
      const stripped = source.replace(
        /function syncLocaleSafely[\s\S]*?\n\}/m,
        "/* syncLocaleSafely stripped for boundary check */",
      );
      // Anywhere else: forbidden.
      expect(stripped).not.toMatch(/i18n\.locale\s*=\s*[^=]/);
    });
  });
});
