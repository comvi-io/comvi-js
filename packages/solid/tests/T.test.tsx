import { describe, it, expect, beforeEach } from "vitest";
import type { JSX } from "solid-js";
import { I18nProvider } from "../src/context";
import { T } from "../src/T";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import type { TagCallbackParams, TranslationResult } from "@comvi/core";
import { flushMicrotasks, renderSolid } from "./test-utils";

describe("T.tsx", () => {
  let fake: FakeI18n;
  let container: HTMLDivElement;

  const renderWithProvider = (ui: () => JSX.Element) => {
    container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        {ui()}
      </I18nProvider>
    ));
  };

  beforeEach(() => {
    fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.hasTranslation.mockImplementation((key: string) => key !== "missing.key");
  });

  it("renders existing translation result", () => {
    fake.tImplementation = (key) => (key === "existing" ? "Existing Translation" : key);

    renderWithProvider(() => <T i18nKey={"existing" as never} />);

    expect(container.textContent).toBe("Existing Translation");
  });

  it("renders fallback prop when translation is missing", () => {
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (_key, params) => params?.fallback ?? "missing.key";

    renderWithProvider(() => <T i18nKey={"missing.key" as never} fallback="Prop fallback" />);

    expect(container.textContent).toBe("Prop fallback");
  });

  it("uses missing-key result over children fallback", () => {
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (key) => (key === "missing.key" ? "Handler fallback" : key);

    renderWithProvider(() => (
      <T i18nKey={"missing.key" as never}>
        <span>Slot fallback</span>
      </T>
    ));

    expect(container.textContent).toBe("Handler fallback");
    expect(container.innerHTML).not.toContain("Slot fallback");
  });

  it("renders children fallback when translation is unresolved", () => {
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (key) => key;

    renderWithProvider(() => (
      <T i18nKey={"missing.key" as never}>
        <span>Slot fallback</span>
      </T>
    ));

    expect(container.innerHTML).toContain("<span>Slot fallback</span>");
  });

  it("renders key when missing and no fallback content exists", () => {
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (key) => key;

    renderWithProvider(() => <T i18nKey={"missing.key" as never} />);

    expect(container.textContent).toBe("missing.key");
  });

  it("does NOT create fallback children when the translation exists", () => {
    let created = 0;
    const SideEffectChild = () => {
      created++;
      return <span>fallback</span>;
    };
    fake.tImplementation = (key) => (key === "existing" ? "Existing Translation" : key);

    renderWithProvider(() => (
      <T i18nKey={"existing" as never}>
        <SideEffectChild />
      </T>
    ));

    expect(container.textContent).toBe("Existing Translation");
    expect(created).toBe(0);
  });

  it("creates fallback children only when the translation is missing", () => {
    let created = 0;
    const SideEffectChild = () => {
      created++;
      return <span>fallback</span>;
    };
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (key) => key;

    renderWithProvider(() => (
      <T i18nKey={"missing.key" as never}>
        <SideEffectChild />
      </T>
    ));

    expect(container.innerHTML).toContain("<span>fallback</span>");
    // Two: the fallback subtree is evaluated once to decide it is non-empty and
    // once to render it. The exact number is what the mirror test's `toBe(0)`
    // is being compared against.
    expect(created).toBe(2);
  });

  it("renders string tag handler mappings", () => {
    fake.tImplementation = (_key, params) => {
      const link = (params?.link as (payload: TagCallbackParams) => TranslationResult)({
        children: "here",
        name: "link",
      });
      return ["Click ", link] as TranslationResult;
    };

    renderWithProvider(() => <T i18nKey={"msg" as never} components={{ link: "a" }} />);

    expect(container.innerHTML).toContain("<a>here</a>");
  });

  it("renders function component mappings", () => {
    const Link = (props: { children?: JSX.Element }) => <a href="/help">{props.children}</a>;
    fake.tImplementation = (_key, params) => {
      const link = (params?.link as (payload: TagCallbackParams) => TranslationResult)({
        children: "here",
        name: "link",
      });
      return ["Click ", link] as TranslationResult;
    };

    renderWithProvider(() => <T i18nKey={"msg" as never} components={{ link: Link }} />);

    expect(container.innerHTML).toContain('<a href="/help">here</a>');
  });

  it("reports and degrades gracefully when function mapping throws", () => {
    fake.tImplementation = (_key, params) => {
      const link = (params?.link as (payload: TagCallbackParams) => TranslationResult)({
        children: "here",
        name: "link",
      });
      return ["Click ", link] as TranslationResult;
    };

    renderWithProvider(() => (
      <T
        i18nKey={"msg" as never}
        components={{
          link: () => {
            throw new Error("handler failed");
          },
        }}
      />
    ));

    expect(container.textContent).toBe("Click here");
    expect(fake.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: "translation", tagName: "link" }),
    );
  });

  it("renders object mappings with string tag and props", () => {
    fake.tImplementation = (_key, params) => {
      const badge = (params?.badge as (payload: TagCallbackParams) => TranslationResult)({
        children: "new",
        name: "badge",
      });
      return ["Status: ", badge] as TranslationResult;
    };

    renderWithProvider(() => (
      <T
        i18nKey={"msg" as never}
        components={{
          badge: { tag: "span", props: { class: "badge" } },
        }}
      />
    ));

    expect(container.innerHTML).toContain('<span class="badge">new</span>');
  });

  it("renders component mapping when tag is provided as function in object form", () => {
    const Badge = (props: { class?: string; children?: JSX.Element }) => (
      <span class={props.class}>{props.children}</span>
    );

    fake.tImplementation = (_key, params) => {
      const badge = (params?.badge as (payload: TagCallbackParams) => TranslationResult)({
        children: "new",
        name: "badge",
      });
      return ["Status: ", badge] as TranslationResult;
    };

    renderWithProvider(() => (
      <T
        i18nKey={"msg" as never}
        components={{
          badge: { tag: Badge, props: { class: "badge" } },
        }}
      />
    ));

    expect(container.innerHTML).toContain('<span class="badge">new</span>');
  });

  it("reports and degrades when object function tag mapping throws", () => {
    const Broken = () => {
      throw new Error("broken tag");
    };

    fake.tImplementation = (_key, params) => {
      const badge = (params?.badge as (payload: TagCallbackParams) => TranslationResult)({
        children: "new",
        name: "badge",
      });
      return ["Status: ", badge] as TranslationResult;
    };

    renderWithProvider(() => (
      <T
        i18nKey={"msg" as never}
        components={{
          badge: { tag: Broken, props: { class: "badge" } },
        }}
      />
    ));

    expect(container.textContent).toBe("Status: new");
    expect(fake.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: "translation", tagName: "badge" }),
    );
  });

  it("renders text and fragment virtual nodes", () => {
    fake.tImplementation = () =>
      [
        { type: "text", text: "Hello" },
        {
          type: "fragment",
          children: [" ", { type: "element", tag: "strong", props: {}, children: ["World"] }],
        },
      ] as unknown as TranslationResult;

    renderWithProvider(() => <T i18nKey={"msg" as never} />);

    expect(container.textContent).toBe("Hello World");
    expect(container.innerHTML).toContain("<strong>World</strong>");
  });

  it("renders empty content arrays as empty output", () => {
    fake.tImplementation = () => [] as unknown as TranslationResult;

    renderWithProvider(() => <T i18nKey={"msg" as never} />);

    expect(container.textContent).toBe("");
  });

  it("passes ns prop to the translation call", () => {
    fake.tImplementation = (_key, params) =>
      params?.ns === "admin" ? "Admin Title" : "Common Title";

    renderWithProvider(() => <T i18nKey={"title" as never} ns="admin" />);

    expect(container.textContent).toBe("Admin Title");
  });

  it("passes locale prop to the translation call", () => {
    fake.tImplementation = (_key, params) => (params?.locale === "fr" ? "Bonjour" : "Hello");

    renderWithProvider(() => <T i18nKey={"greeting" as never} locale="fr" />);

    expect(container.textContent).toBe("Bonjour");
  });

  it("does not recompute when global locale changes and locale prop is pinned", async () => {
    fake.tImplementation = (_key, params) => `locale=${String(params?.locale ?? fake.language)}`;

    // The unpinned sibling is the positive control: it proves the locale flip
    // DID reach a `<T>` in the same flush, so the pinned one's unchanged call
    // count is a real negative rather than a not-yet.
    renderWithProvider(() => (
      <>
        <span data-testid="pinned">
          <T i18nKey={"greeting" as never} locale="fr" />
        </span>
        <span data-testid="unpinned">
          <T i18nKey={"greeting" as never} />
        </span>
      </>
    ));

    const pinned = container.querySelector('[data-testid="pinned"]')!;
    const unpinned = container.querySelector('[data-testid="unpinned"]')!;

    expect(pinned.textContent).toBe("locale=fr");
    expect(unpinned.textContent).toBe("locale=en");
    const callsAfterRender = fake.tRaw.mock.calls.length;

    await fake.setLocaleAsync("de");
    await flushMicrotasks(2);

    expect(unpinned.textContent).toBe("locale=de");
    expect(pinned.textContent).toBe("locale=fr");
    expect(fake.tRaw).toHaveBeenCalledTimes(callsAfterRender + 1);
  });

  it("passes params to the translation call for interpolation", () => {
    fake.tImplementation = (_key, params) => (params?.name ? `Hello ${params.name}` : "Hello");

    renderWithProvider(() => <T i18nKey={"greeting" as never} params={{ name: "Alice" }} />);

    expect(container.textContent).toBe("Hello Alice");
  });

  it("passes raw flag to skip post-processing", () => {
    fake.tImplementation = (_key, params) => (params?.raw ? "raw content" : "processed content");

    renderWithProvider(() => <T i18nKey={"msg" as never} raw />);

    expect(container.textContent).toBe("raw content");
  });

  it("reactively updates when locale changes", async () => {
    const texts: Record<string, string> = {
      en: "Hello",
      fr: "Bonjour",
    };
    fake.tImplementation = (key) => (key === "greeting" ? texts[fake.language] : key);

    renderWithProvider(() => <T i18nKey={"greeting" as never} />);

    expect(container.textContent).toBe("Hello");

    await fake.setLocaleAsync("fr");
    await flushMicrotasks();

    expect(container.textContent).toBe("Bonjour");
  });
});
