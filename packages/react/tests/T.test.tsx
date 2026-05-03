import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;
  getDefaultNamespace: () => string;
  reportError: (error: unknown, context?: Record<string, unknown>) => void;
};

const createHookStub = (overrides: Partial<UseI18nStub> = {}): UseI18nStub => ({
  t: ((key, params) => params?.fallback ?? key) as UseI18nStub["t"],
  locale: "en",
  hasTranslation: () => true,
  getDefaultNamespace: () => "default",
  reportError: vi.fn(),
  ...overrides,
});

describe("<T />", () => {
  beforeEach(() => {
    mockUseI18n.mockReset();
  });

  it("renders VirtualNode arrays as React elements", () => {
    const t = vi.fn(
      () =>
        [
          "Hello ",
          { type: "element", tag: "strong", props: {}, children: ["World"] },
        ] as unknown as TranslationResult,
    );
    mockUseI18n.mockReturnValue(createHookStub({ t }));

    const { container } = render(<T i18nKey="msg" />);

    expect(screen.getByText("World").tagName).toBe("STRONG");
    expect(container.textContent).toBe("Hello World");
  });

  it("renders string tag handlers from components map", () => {
    const t = vi.fn((_key: string, params?: TranslationParams) => {
      const node = (params?.bold as (args: { children: string; name: string }) => unknown)({
        children: "bold",
        name: "bold",
      });
      return ["This is ", node] as unknown as TranslationResult;
    });
    mockUseI18n.mockReturnValue(createHookStub({ t }));

    render(<T i18nKey="msg" components={{ bold: "strong" }} />);

    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("renders React element handlers with injected children", () => {
    const t = vi.fn((_key: string, params?: TranslationParams) => {
      const node = (params?.link as (args: { children: string; name: string }) => unknown)({
        children: "here",
        name: "link",
      });
      return ["Click ", node] as unknown as TranslationResult;
    });
    mockUseI18n.mockReturnValue(createHookStub({ t }));

    render(<T i18nKey="msg" components={{ link: <a href="/help" /> }} />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/help");
    expect(link.textContent).toBe("here");
  });

  it("reports and degrades gracefully when function handler throws", () => {
    const reportError = vi.fn();
    const t = vi.fn((_key: string, params?: TranslationParams) => {
      const node = (params?.link as (args: { children: string; name: string }) => unknown)({
        children: "here",
        name: "link",
      });
      return ["Click ", node] as unknown as TranslationResult;
    });
    mockUseI18n.mockReturnValue(createHookStub({ t, reportError }));

    render(
      <T
        i18nKey="msg"
        components={{
          link: () => {
            throw new Error("handler failed");
          },
        }}
      />,
    );

    expect(screen.getByText("Click here").textContent).toBe("Click here");
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: "translation", tagName: "link" }),
    );
  });

  it("reports and degrades when handler returns a non-element", () => {
    const reportError = vi.fn();
    const t = vi.fn((_key: string, params?: TranslationParams) => {
      const node = (params?.link as (args: { children: string; name: string }) => unknown)({
        children: "here",
        name: "link",
      });
      return ["Click ", node] as unknown as TranslationResult;
    });
    mockUseI18n.mockReturnValue(createHookStub({ t, reportError }));

    render(
      <T
        i18nKey="msg"
        components={{
          link: (() => null) as unknown as ({
            children,
          }: {
            children: React.ReactNode;
          }) => React.ReactElement,
        }}
      />,
    );

    expect(screen.getByText("Click here").textContent).toBe("Click here");
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: "translation", tagName: "link" }),
    );
  });

  it("reports and degrades when React.cloneElement throws for element handlers", () => {
    const reportError = vi.fn();
    const t = vi.fn((_key: string, params?: TranslationParams) => {
      const node = (params?.link as (args: { children: string; name: string }) => unknown)({
        children: "here",
        name: "link",
      });
      return ["Click ", node] as unknown as TranslationResult;
    });
    const cloneSpy = vi.spyOn(React, "cloneElement");
    cloneSpy.mockImplementationOnce(() => {
      throw new Error("clone failed");
    });
    mockUseI18n.mockReturnValue(createHookStub({ t, reportError }));

    render(<T i18nKey="msg" components={{ link: <a href="/help" /> }} />);

    expect(screen.getByText("Click here").textContent).toBe("Click here");
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: "translation", tagName: "link" }),
    );

    cloneSpy.mockRestore();
  });

  it("keeps raw React nodes from translation result arrays", () => {
    const t = vi.fn(() => ["Hi ", <em key="name">Alice</em>] as unknown as TranslationResult);
    mockUseI18n.mockReturnValue(createHookStub({ t }));

    const { container } = render(<T i18nKey="msg" />);

    expect(screen.getByText("Alice").tagName).toBe("EM");
    expect(container.textContent).toBe("Hi Alice");
  });
});
