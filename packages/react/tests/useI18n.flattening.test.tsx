/**
 * `t()` promises PLAIN TEXT for every shape `tRaw()` can return. The structured
 * result may nest virtual nodes, React elements and values that are neither, so
 * the flattening walk — not just its string fast path — is the contract here.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import type { TranslationResult } from "../src/index";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

const createWrapper = (fake: FakeI18n) => {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={fake.asI18n()} autoInit={false}>
      {children}
    </I18nProvider>
  );
};

/** Drives `t()` for a host whose raw result is fixed to `raw`. */
const flatten = (raw: unknown): string => {
  const fake = new FakeI18n();
  fake.tImplementation = () => raw as TranslationResult;

  const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

  return result.current.t("msg" as never);
};

/** A child React cannot render; `t()` must still reduce it to text. */
const element = (child: unknown) => React.createElement("span", { key: "s" }, child as ReactNode);

describe("useI18n() — t() text flattening", () => {
  it.each([
    {
      shape: "a nested element node",
      raw: [
        {
          type: "element",
          tag: "p",
          props: {},
          children: [{ type: "element", tag: "b", props: {}, children: ["deep"] }, " tail"],
        },
      ],
      text: "deep tail",
    },
    {
      shape: "a text node",
      raw: [{ type: "text", text: "world" }],
      text: "world",
    },
    {
      shape: "a fragment node",
      raw: [{ type: "fragment", children: ["frag", { type: "text", text: "ment" }] }],
      text: "fragment",
    },
    {
      shape: "an element child array holding null and boolean holes",
      raw: [element([null, false, "B"])],
      text: "B",
    },
    {
      shape: "an element wrapping a virtual node",
      raw: [element({ type: "element", tag: "b", props: {}, children: ["deep"] })],
      text: "deep",
    },
    {
      shape: "an element wrapping another element",
      raw: [element(React.createElement("em", null, "inner"))],
      text: "inner",
    },
    {
      shape: "an element wrapping a value that is neither node nor element",
      raw: [element({ toString: () => "opaque" })],
      text: "opaque",
    },
    {
      shape: "a bare number entry",
      raw: ["n=", 42],
      text: "n=42",
    },
  ])("flattens $shape to $text", ({ raw, text }) => {
    expect(flatten(raw)).toBe(text);
  });

  it("keeps the empty string when the result array is empty", () => {
    expect(flatten([])).toBe("");
  });
});

describe("useI18n() — t() flattening of malformed entries", () => {
  it("stringifies a null entry instead of throwing", () => {
    expect(flatten(["a", null])).toBe("anull");
  });

  it("stringifies a value carrying props but no React element brand", () => {
    expect(flatten(["a", { props: { children: "X" } }])).toBe("a[object Object]");
  });

  it("stringifies a branded value whose props are not an object", () => {
    const branded = { $$typeof: Symbol.for("react.transitional.element"), props: "not-an-object" };

    expect(flatten(["a", branded])).toBe("a[object Object]");
  });

  it("tolerates a branded value whose props are null", () => {
    const branded = { $$typeof: Symbol.for("react.transitional.element"), props: null };

    expect(flatten(["a", branded])).toBe("a");
  });

  // Same guard, one level deeper: the recursive walk hits its own `props?.`.
  it("tolerates a branded value with null props nested inside an element", () => {
    const branded = { $$typeof: Symbol.for("react.transitional.element"), props: null };

    expect(flatten([element(branded)])).toBe("");
  });
});
