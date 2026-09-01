/**
 * `<T>`'s VirtualNode → React converter. The host is stubbed so every node
 * shape the core pipeline can emit — text, fragment, scalar and absent
 * children, keyed nodes, marker-transported handlers — reaches the converter;
 * `prepareTranslation` and the marker transport are the real ones.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { TranslationParams, TranslationResult } from "../src";

const { mockUseI18n } = vi.hoisted(() => ({
  mockUseI18n: vi.fn(),
}));

vi.mock("../src/useI18n", () => ({
  useI18n: mockUseI18n,
}));

import { T } from "../src/T";

type UseI18nStub = {
  t: (key: string, params?: TranslationParams) => TranslationResult;
  locale: string;
  hasTranslation: () => boolean;
  getDefaultNamespace: () => string;
  reportError: (error: unknown, context?: Record<string, unknown>) => void;
};

const createHookStub = (overrides: Partial<UseI18nStub> = {}): UseI18nStub => ({
  t: ((key) => key) as UseI18nStub["t"],
  locale: "en",
  hasTranslation: () => true,
  getDefaultNamespace: () => "default",
  reportError: vi.fn(),
  ...overrides,
});

/** Fixes the host's raw result, then renders `<T i18nKey="msg" />`. */
const renderResult = (raw: unknown) => {
  mockUseI18n.mockReturnValue(createHookStub({ t: () => raw as TranslationResult }));

  return render(<T i18nKey="msg" />);
};

const elementNode = (tag: string, children: unknown, key?: string) => ({
  type: "element",
  tag,
  props: {},
  children,
  ...(key === undefined ? {} : { key }),
});

describe("<T /> node conversion", () => {
  beforeEach(() => {
    mockUseI18n.mockReset();
  });

  it("renders a text node as its text", () => {
    const { container } = renderResult([{ type: "text", text: "Hi" }]);

    expect(container.textContent).toBe("Hi");
  });

  it("renders a fragment node's children without adding a wrapper element", () => {
    const { container } = renderResult([
      { type: "fragment", children: ["a", elementNode("b", ["c"])] },
    ]);

    expect(container.textContent).toBe("ac");
    expect(container.querySelector("b")!.textContent).toBe("c");
    expect(container.children).toHaveLength(1);
  });

  it("renders an element node whose children are a bare string", () => {
    const { container } = renderResult([elementNode("i", "solo")]);

    expect(container.querySelector("i")!.textContent).toBe("solo");
  });

  it("renders an element node with empty-string children as an empty element", () => {
    const { container } = renderResult([elementNode("i", "")]);

    expect(container.querySelector("i")!.textContent).toBe("");
  });

  it("renders an element node with null children as an empty element", () => {
    const { container } = renderResult([elementNode("i", null)]);

    expect(container.querySelector("i")!.textContent).toBe("");
  });

  it("renders an element node whose children are a single React node", () => {
    const { container } = renderResult([
      elementNode("i", React.createElement("em", { key: "e" }, "x")),
    ]);

    expect(container.querySelector("i > em")!.textContent).toBe("x");
  });
});

describe("<T /> React keys", () => {
  beforeEach(() => {
    mockUseI18n.mockReset();
  });

  it("keeps the DOM node identity when a keyed node shifts position", () => {
    const keyed = elementNode("b", ["x"], "kb");
    mockUseI18n.mockReturnValue(createHookStub({ t: () => [keyed] as TranslationResult }));

    const { container, rerender } = render(<T i18nKey="msg" v={1} />);
    const before = container.querySelector("b");

    mockUseI18n.mockReturnValue(createHookStub({ t: () => ["lead ", keyed] as TranslationResult }));
    rerender(<T i18nKey="msg" v={2} />);

    expect(container.querySelector("b")).toBe(before);
  });

  it("keeps the DOM node identity when a keyed fragment shifts position", () => {
    const keyed = { type: "fragment", children: [elementNode("b", ["x"])], key: "kf" };
    mockUseI18n.mockReturnValue(createHookStub({ t: () => [keyed] as TranslationResult }));

    const { container, rerender } = render(<T i18nKey="msg" v={1} />);
    const before = container.querySelector("b");

    mockUseI18n.mockReturnValue(createHookStub({ t: () => ["lead ", keyed] as TranslationResult }));
    rerender(<T i18nKey="msg" v={2} />);

    expect(container.querySelector("b")).toBe(before);
  });

  it("gives sibling entries distinct keys so React logs no duplicate-key warning", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    renderResult([
      "a",
      elementNode("b", ["one"]),
      "c",
      elementNode("b", ["two"]),
      React.createElement("em", null, "d"),
      React.createElement("em", null, "e"),
    ]);

    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
  });
});

describe("<T /> handler resolution", () => {
  beforeEach(() => {
    mockUseI18n.mockReset();
  });

  /** Drives the marker transport the way the core pipeline does. */
  const invokeHandler =
    (name: string, children: string) => (_key: string, params?: TranslationParams) => {
      const handler = params?.[name] as (args: { children: string; name: string }) => unknown;
      return ["Click ", handler({ children, name })] as unknown as TranslationResult;
    };

  it("degrades to the tag's children when the handler cannot be invoked", () => {
    mockUseI18n.mockReturnValue(createHookStub({ t: invokeHandler("link", "here") }));

    const { container } = render(
      <T i18nKey="msg" components={{ link: 42 as unknown as string }} />,
    );

    expect(container.textContent).toBe("Click here");
    expect(container.querySelector("a")).toBeNull();
  });

  it("degrades each failing handler independently and keeps their keys distinct", () => {
    const reportError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = (() => {
      throw new Error("handler failed");
    }) as unknown as () => React.ReactElement;
    mockUseI18n.mockReturnValue(
      createHookStub({
        t: ((_key: string, params?: TranslationParams) => {
          const one = params?.one as (a: { children: string; name: string }) => unknown;
          const two = params?.two as (a: { children: string; name: string }) => unknown;
          return [
            "A",
            one({ children: "1", name: "one" }),
            "B",
            two({ children: "2", name: "two" }),
          ];
        }) as UseI18nStub["t"],
        reportError,
      }),
    );

    const { container } = render(<T i18nKey="msg" components={{ one: boom, two: boom }} />);

    expect(container.textContent).toBe("A1B2");
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
  });

  it("names the offending tag in the error thrown for a non-element handler result", () => {
    const reportError = vi.fn();
    mockUseI18n.mockReturnValue(createHookStub({ t: invokeHandler("link", "here"), reportError }));

    render(
      <T
        i18nKey="msg"
        components={{
          link: (() => null) as unknown as () => React.ReactElement,
        }}
      />,
    );

    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Tag handler for "link" must return a React element',
      }),
      { source: "translation", tagName: "link" },
    );
  });
});
