/**
 * `<T>` and `t()` render the same TEXT for the same message — property-tested
 * on generated messages against REAL `@comvi/core`.
 *
 * The claim needs one condition to be true at all: `<T>` always parses tag
 * syntax (it hands the grammar to core per call), while plain `t()` parses it
 * only when the app registered it for the string API. So the two are compared
 * with the grammar registered; unregistered, `t("<b>x</b>")` is by design the
 * literal markup, and the claim holds only for messages with no `<`, `&` or
 * `\` — the second property below.
 *
 * Generator, seed, run count and how to read a failure:
 * `packages/core/tests/helpers/messageFuzz.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { icuCompiler } from "@comvi/core/icu";
import { registerTagSyntax } from "@comvi/core/rich-text";
import { createI18n } from "../src/index";
import { I18nProvider } from "../src/I18nProvider";
import { T } from "../src/T";
import { checkMessages, FUZZ_RUNS, FUZZ_TIMEOUT_MS } from "@comvi/test-utils/messageFuzz";

const PARAMS = { name: "Ada 👩🏽‍💻", count: 2, gender: "female", n: 1 };

// `i` and `br` are left without a handler on purpose: an unhandled tag
// degrades to its inner text, and that path has to agree with `t()` as well.
const COMPONENTS = { b: "strong", link: "a" };

/**
 * The text `<T>` puts in the DOM and the string `t()` returns, for one
 * message — or `undefined` when development refused the catalog with
 * `E_ICU_SYNTAX`, which leaves nothing to compare.
 */
function renderBoth(message: string): { component: string | null; string: string } | undefined {
  let i18n;
  try {
    i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      compiler: icuCompiler,
      onError: () => {},
      messages: { en: { message } },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "E_ICU_SYNTAX") return undefined;
    throw error;
  }

  const { container } = render(
    <I18nProvider i18n={i18n} autoInit={false}>
      <T i18nKey={"message" as never} params={PARAMS} components={COMPONENTS} />
    </I18nProvider>,
  );
  const component = container.textContent;
  // Not `unmount()`: that leaves the container in `document.body`, and a long
  // local run then holds one detached tree per case.
  cleanup();

  return { component, string: i18n.t("message" as never, PARAMS as never) };
}

beforeEach(() => {
  // Malformed input warns by design (unbalanced braces, an unclosed tag), and
  // React objects to the DOM nesting a generated message asks for (`<a>` in `<a>`).
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("<T> ≡ t() on generated messages", () => {
  it(
    "tag syntax registered for the string API: any message → the same text",
    () => {
      const unregister = registerTagSyntax();
      let compared = 0;

      try {
        checkMessages("<T> ≡ t(), tags registered", (message) => {
          const both = renderBoth(message);
          if (both === undefined) return;
          compared++;

          expect(both.component).toBe(both.string);
        });
      } finally {
        unregister();
      }

      expect(compared).toBeGreaterThan(FUZZ_RUNS / 2);
    },
    FUZZ_TIMEOUT_MS,
  );

  it(
    "nothing registered: a message with no `<`, `&` or `\\` → the same text",
    () => {
      let compared = 0;

      checkMessages(
        "<T> ≡ t(), no tag syntax in the message",
        (message) => {
          const both = renderBoth(message);
          if (both === undefined) return;
          compared++;

          expect(both.component).toBe(both.string);
        },
        {
          where: (message) => !/[<&\\]/.test(message),
        },
      );

      expect(compared).toBeGreaterThan(FUZZ_RUNS / 10);
    },
    FUZZ_TIMEOUT_MS,
  );
});

describe("counterexamples the fuzzer found", () => {
  // Fixed in COM-146: `<T>` hands each `components` entry to core as the
  // parameter of that name, so a `{link}` placeholder resolved to the HANDLER
  // and its source code landed in the DOM ("({ children }) => createElement(…").
  // One mistyped character in a translation (`{link}` for `<link>`) was
  // enough. A function is no longer a value for a placeholder.
  it("a placeholder named like a `components` entry → the literal placeholder", () => {
    const both = renderBoth("{link}");

    expect(both?.component).toBe("{link}");
  });

  it("t(): a placeholder with no parameter of that name → the literal placeholder", () => {
    const both = renderBoth("{link}");

    expect(both?.string).toBe("{link}");
  });
});
