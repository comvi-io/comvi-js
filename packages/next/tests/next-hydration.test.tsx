/**
 * Includes a source boundary: no instance-locale mutation outside
 * `syncLocaleSafely` in `next/client/I18nProvider.tsx`, so a future refactor
 * that reintroduces render-time mutation fails here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";

import { createI18n, T } from "@comvi/react";
import { I18nProvider } from "../src/client/I18nProvider";
import { flushMicrotasks, renderWarnings, spyOnConsoleError } from "./helpers/consoleWarnings";

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

function mountSsrOutput(html: string): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
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
    let errorSpy: ReturnType<typeof spyOnConsoleError>;
    let warnSpy: ReturnType<typeof spyOnConsoleError>;

    beforeEach(() => {
      errorSpy = spyOnConsoleError();
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("hydrating the SSR output emits no error / warning calls", async () => {
      const messages = { fr: { greeting: "Bonjour" } };
      const html = renderToString(makeProviderTree("fr", messages));
      const container = mountSsrOutput(html);

      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, makeProviderTree("fr", messages));
      });

      expect(container.textContent).toContain("Bonjour");
      // A hydration mismatch would emit console.error.
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it("hydrating an alternative locale also produces no warnings", async () => {
      const messages = { de: { greeting: "Hallo" } };
      const html = renderToString(makeProviderTree("de", messages));
      const container = mountSsrOutput(html);

      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, makeProviderTree("de", messages));
      });

      expect(container.textContent).toContain("Hallo");
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it("prop-only re-render after hydrateRoot with same messages reference emits no 'Cannot update a component' error", async () => {
      const messages = { fr: { greeting: "Bonjour" } };
      const i18n = createI18n({ locale: "placeholder", translation: { placeholder: {} } });
      // The shared i18n + messages identity IS the scenario, so one element is
      // rendered on the server, hydrated, and re-rendered — React elements are
      // immutable, so reusing it changes nothing but the noise.
      const tree = (
        <I18nProvider i18n={i18n} locale="fr" messages={messages} autoInit={false}>
          <span data-testid="greeting">
            <T i18nKey={"greeting" as never} />
          </span>
        </I18nProvider>
      );

      const container = mountSsrOutput(renderToString(tree));

      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, tree);
      });

      expect(container.textContent).toContain("Bonjour");

      // Same messages reference: the useIsomorphicLayoutEffect identity guard
      // must skip addTranslations, so nothing is emitted.
      await act(async () => {
        root.render(tree);
        await flushMicrotasks();
      });

      expect(renderWarnings(errorSpy)).toHaveLength(0);

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });

    it("POSITIVE CONTROL: a server/client locale mismatch does reach the console.error spy", async () => {
      // Without this case, every `expect(errorSpy).not.toHaveBeenCalled()` in
      // this family would still pass if the spy were mis-wired, the console
      // swallowed, or React stopped emitting the warning altogether.
      const html = renderToString(makeProviderTree("fr", { fr: { greeting: "Bonjour" } }));
      const container = mountSsrOutput(html);

      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, makeProviderTree("de", { de: { greeting: "Hallo" } }));
      });

      // React 19 hands console.error an Error object, not a format string.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "Hydration failed because the server rendered text didn't match",
          ),
        }),
      );
      expect(container.textContent).toContain("Hallo");

      await act(async () => {
        root.unmount();
      });
      document.body.removeChild(container);
    });
  });

  describe("Architectural boundary — no render-time i18n.locale mutation", () => {
    it("`i18n.locale =` only appears inside the syncLocaleSafely helper", () => {
      const source = readFileSync(resolve(__dirname, "../src/client/I18nProvider.tsx"), "utf8");

      // syncLocaleSafely is the one place this mutation is allowed to live.
      // The strip is coupled to that helper's NAME and to its closing brace
      // sitting at column 0: renaming or reformatting it fails this test with a
      // mismatch on the raw source rather than an explanation.
      const stripped = source.replace(
        /function syncLocaleSafely[\s\S]*?\n\}/m,
        "/* syncLocaleSafely stripped for boundary check */",
      );

      expect(stripped).not.toMatch(/i18n\.locale\s*=\s*[^=]/);
      expect(stripped).toContain("syncLocaleSafely stripped for boundary check");
    });
  });
});
