/**
 * next-hydration.test.tsx — W2c regression for the render-mutation removal.
 *
 * Audit ref: Dim 3 P1 + Dim 5 P2 in `packages/react/AUDIT-FINDINGS.md`,
 * and ADR docs/adr/0001-i18n-locale-source.md.
 *
 * The prior next/client/I18nProvider.tsx mutated `i18n.locale = locale` and
 * called `i18n.addTranslations(messages)` from inside the function body
 * (guarded by `isFirstRenderRef`). W2c moves the once-per-instance setup
 * into a React-blessed `useState(() => ...)` lazy initializer.
 *
 * This file verifies:
 *   1. `renderToString` produces HTML containing the locale-specific
 *      translation text — proving the setup runs before the inner React
 *      provider renders descendants.
 *   2. `hydrateRoot` against the SSR output emits NO `console.error` and
 *      NO `console.warn` — proving the client first render matches the
 *      server output (hydration invariant preserved).
 *   3. Architectural boundary: the only `i18n.locale = ` occurrence in
 *      `next/client/I18nProvider.tsx` is inside the `syncLocaleSafely`
 *      helper (NOT in the render body). Future refactors that re-introduce
 *      the render-time mutation will fail this test.
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

describe("Next <I18nProvider> SSR + hydration (W2c)", () => {
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

  describe("hydrateRoot — zero console warnings (W2c acceptance gate)", () => {
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

      // 1. Produce the SSR HTML.
      const html = renderToString(tree);
      expect(html).toContain("Bonjour");

      // 2. Mount the HTML into a container and hydrate against a fresh tree
      //    with the same shape. Use a fresh createI18n inside makeProviderTree
      //    — the hydrate path must end up at the same locale via the lazy
      //    initializer, NOT depending on a pre-set i18n.locale.
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);

      const clientTree = makeProviderTree("fr", messages);
      await act(async () => {
        hydrateRoot(container, clientTree);
      });

      expect(container.textContent).toContain("Bonjour");
      // The acceptance gate: a hydration mismatch would emit console.error
      // ("Hydration failed because the server-rendered HTML didn't match...")
      // and possibly console.warn. Neither should fire.
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

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
      await act(async () => {
        hydrateRoot(container, clientTree);
      });

      expect(container.textContent).toContain("Hallo");
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

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
