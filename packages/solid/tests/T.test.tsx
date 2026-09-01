import { describe, it, expect, beforeEach } from "vitest";
import type { JSX } from "solid-js";
import { I18nProvider } from "../src/context";
import { T } from "../src/T";
import { createI18n } from "../src/index";
import type { ComponentMap } from "../src/types";
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

  it("re-renders when translations are added to the host catalog", async () => {
    renderWithProvider(() => <T i18nKey={"greeting" as never} />);

    expect(container.textContent).toBe("greeting");

    fake.addTranslations({ en: { greeting: "Hello" } });
    await flushMicrotasks();

    expect(container.textContent).toBe("Hello");
  });

  it("degrades a non-invokable handler to the tag's children without reporting an error", () => {
    // A JS consumer passing an already-created element where a component
    // function belongs: unusable as a component, but not an error either.
    const alreadyRendered = document.createElement("mark");
    fake.tImplementation = (_key, params) => {
      const badge = (params?.badge as (payload: TagCallbackParams) => TranslationResult)({
        children: "gold",
        name: "badge",
      });
      return ["You earned ", badge] as TranslationResult;
    };

    renderWithProvider(() => (
      <T
        i18nKey={"earned" as never}
        components={{ badge: alreadyRendered } as unknown as ComponentMap}
      />
    ));

    expect(container.textContent).toBe("You earned gold");
    expect(container.innerHTML).not.toContain("__comvi_handler");
    expect(fake.reportError).not.toHaveBeenCalled();
  });

  it("renders nothing when the host resolves the key to no content", () => {
    fake.tImplementation = () => null as unknown as TranslationResult;

    renderWithProvider(() => <T i18nKey={"msg" as never} />);

    expect(container.textContent).toBe("");
  });

  it("keeps the same fallback DOM node when the translation is still missing after a recompute", async () => {
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (key) => key;

    renderWithProvider(() => (
      <T i18nKey={"missing.key" as never}>
        <span>Slot fallback</span>
      </T>
    ));
    const mounted = container.querySelector("span");

    await fake.setLocaleAsync("fr");
    await flushMicrotasks(2);

    expect(container.querySelector("span")).toBe(mounted);
  });

  it("scopes the missing-key check to the active locale and default namespace", () => {
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (key) => key;

    renderWithProvider(() => (
      <T i18nKey={"missing.key" as never}>
        <span>Slot fallback</span>
      </T>
    ));

    expect(fake.hasTranslation).toHaveBeenCalledWith("missing.key", "en", "common", true);
  });

  it("keeps a key that resolves only through the fallback locale out of the missing path", () => {
    // "ok" translates to the literal string "ok", so the resolved text alone
    // cannot tell present from missing — only the fallback-aware host check can.
    fake = new FakeI18n({ language: "de", defaultNamespace: "common" });
    fake.addTranslations({ "en:common": { ok: "ok" } });
    fake.setFallbackLocale("en");

    renderWithProvider(() => (
      <T i18nKey={"ok" as never}>
        <span>Slot fallback</span>
      </T>
    ));

    expect(container.textContent).toBe("ok");
  });

  it("asks the host for the key alone when no params, components or overrides are given", () => {
    fake.tImplementation = () => "Hello";

    renderWithProvider(() => <T i18nKey={"greeting" as never} />);

    expect(container.textContent).toBe("Hello");
    expect(fake.tRaw.mock.calls).toEqual([["greeting"]]);
  });

  it("asks the host for the key alone when the components map is empty", () => {
    fake.tImplementation = () => "Hello";

    renderWithProvider(() => <T i18nKey={"greeting" as never} components={{}} />);

    expect(container.textContent).toBe("Hello");
    expect(fake.tRaw.mock.calls).toEqual([["greeting"]]);
  });

  it("asks the host for the key alone when the params object is empty", () => {
    fake.tImplementation = () => "Hello";

    renderWithProvider(() => <T i18nKey={"greeting" as never} params={{}} />);

    expect(container.textContent).toBe("Hello");
    expect(fake.tRaw.mock.calls).toEqual([["greeting"]]);
  });

  it("renders children fallback for a missing key when params are given", () => {
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (key) => key;

    renderWithProvider(() => (
      <T i18nKey={"missing.key" as never} params={{ name: "Ada" }}>
        <span>Slot fallback</span>
      </T>
    ));

    expect(container.innerHTML).toContain("<span>Slot fallback</span>");
  });

  it("renders the key itself for a missing key with params and no children", () => {
    fake.hasTranslation.mockImplementation(() => false);
    fake.tImplementation = (key) => key;

    renderWithProvider(() => <T i18nKey={"missing.key" as never} params={{ name: "Ada" }} />);

    expect(container.textContent).toBe("missing.key");
  });

  it("renders the translation over children when the key resolves and params are given", () => {
    fake.tImplementation = (_key, params) => `Hello ${String(params?.name)}`;

    renderWithProvider(() => (
      <T i18nKey={"greeting" as never} params={{ name: "Ada" }}>
        <span>Slot fallback</span>
      </T>
    ));

    expect(container.textContent).toBe("Hello Ada");
    expect(container.innerHTML).not.toContain("Slot fallback");
  });
});

describe("<T /> markup without a components map (real core)", () => {
  it("parses tag markup in the translation and falls unmapped tags back to inner text", async () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { note: "Read the <b>fine</b> print" } },
    });
    await i18n.init();

    const container = renderSolid(() => (
      <I18nProvider i18n={i18n} autoInit={false}>
        <T i18nKey={"note" as never} />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("Read the fine print");
  });
});
