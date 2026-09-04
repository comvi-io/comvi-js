/**
 * A tag handler that is a COMPONENT or an ELEMENT is `React.createElement`'d by
 * `<T>`, so a throw during its render happens after `<T>` has returned — no
 * synchronous try/catch can see it. These cases pin the error boundary that
 * degrades such a handler to the tag's children, the same way a throwing
 * FUNCTION handler already degrades.
 *
 * Client render on purpose: a React error boundary only catches while React is
 * rendering into the DOM. The server counterpart is pinned in `ssr.node.test.tsx`.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { createI18n } from "../src";
import type { ErrorReportContext } from "@comvi/core";
import { I18nProvider } from "../src/I18nProvider";
import { T } from "../src/T";

declare module "@comvi/core" {
  interface TranslationKeys {
    msg: never;
  }
}

/** A component handler that fails while React renders it, not while `<T>` runs. */
const Exploding = (): React.ReactElement => {
  throw new Error("handler exploded");
};

const Fine = ({ children }: { children?: React.ReactNode }): React.ReactElement => (
  <strong>{children}</strong>
);

/** React logs every error a boundary catches; the assertions cover reporting. */
const silenceReactErrorLog = () => vi.spyOn(console, "error").mockImplementation(() => {});

const renderMessage = async (
  onError: (error: Error, context?: ErrorReportContext) => void,
  components: Record<string, unknown>,
) => {
  const i18n = createI18n({
    locale: "en",
    translation: { en: { msg: "Click <link>here</link>" } },
    onError,
  });
  await i18n.init();

  return render(
    <I18nProvider i18n={i18n} autoInit={false}>
      <T i18nKey="msg" components={components as never} />
    </I18nProvider>,
  );
};

describe("<T /> component and element tag handlers that throw while rendering", () => {
  it("renders the tag's children when a component handler throws → 'Click here'", async () => {
    silenceReactErrorLog();
    const onError = vi.fn();

    const { container } = await renderMessage(onError, { link: <Exploding /> });

    expect(container.textContent).toBe("Click here");
  });

  it("reports a throwing component handler with the tag name as written → tagName 'link'", async () => {
    silenceReactErrorLog();
    const onError = vi.fn();

    await renderMessage(onError, { link: <Exploding /> });

    expect(onError).toHaveBeenCalledWith(
      new Error("handler exploded"),
      expect.objectContaining({ source: "translation", tagName: "link" }),
    );
  });

  it("degrades a throwing element target in the `{ tag, props }` config form → 'Click here'", async () => {
    silenceReactErrorLog();
    const onError = vi.fn();

    const { container } = await renderMessage(onError, {
      link: { tag: <Exploding />, props: { id: "boom" } },
    });

    expect(container.textContent).toBe("Click here");
    expect(onError).toHaveBeenCalledWith(
      new Error("handler exploded"),
      expect.objectContaining({ source: "translation", tagName: "link" }),
    );
  });

  // Regression guard: the boundary must not disturb a handler that works.
  it("leaves a working element handler alone → renders it and reports nothing", async () => {
    const onError = vi.fn();

    const { container } = await renderMessage(onError, { link: <Fine /> });

    expect(container.querySelector("strong")?.textContent).toBe("here");
    expect(onError).not.toHaveBeenCalled();
  });

  // Regression guard: the pre-existing FUNCTION-handler path keeps its own
  // synchronous try/catch and must not be wrapped a second time.
  it("still degrades a function handler that throws when invoked → 'Click here'", async () => {
    const onError = vi.fn();

    const { container } = await renderMessage(onError, {
      link: () => {
        throw new Error("invocation exploded");
      },
    });

    expect(container.textContent).toBe("Click here");
    expect(onError).toHaveBeenCalledWith(
      new Error("invocation exploded"),
      expect.objectContaining({ source: "translation", tagName: "link" }),
    );
  });
});
