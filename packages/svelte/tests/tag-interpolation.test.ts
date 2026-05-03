import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, unmount } from "svelte";
import T from "../src/T.svelte";
import TInterpolationWrapper from "./TInterpolationWrapper.test.svelte";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import type { TranslationResult } from "@comvi/core";

const createInterpolationI18n = (): FakeI18n => {
  const fake = new FakeI18n({ language: "en", defaultNamespace: "default" });
  fake.addTranslations({
    en: { welcome: "x", linebreak: "x", unsafe: "x", reserved: "x" },
    "fr:admin": { reserved: "x" },
  });
  fake.tImplementation = (key, params): TranslationResult => {
    if (key === "welcome") {
      const strong =
        typeof params?.strong === "function"
          ? params.strong({ children: String(params.name ?? ""), name: "strong" })
          : String(params?.name ?? "");
      return ["Hello ", strong, "!"];
    }

    if (key === "linebreak") {
      const br =
        typeof params?.break === "function" ? params.break({ children: [], name: "break" }) : "";
      return ["Top", br, "Bottom"];
    }

    if (key === "unsafe") {
      return "<img src=x onerror=alert(1)>";
    }

    if (key === "reserved") {
      return `locale=${String(params?.locale)}|ns=${String(params?.ns)}|fallback=${String(
        params?.fallback,
      )}|raw=${String(params?.raw)}`;
    }

    return key;
  };
  return fake;
};

describe("T.svelte tag interpolation contract", () => {
  let fake: FakeI18n;
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    fake = createInterpolationI18n();
    component = null;
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    target.remove();
  });

  it("maps interpolation tags to configured HTML tags with attributes", () => {
    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "welcome",
        params: { name: "Alice" },
        components: {
          strong: {
            tag: "em",
            props: {
              class: "highlight",
              hidden: true,
              disabled: false,
            },
          },
        },
      },
    });

    expect(target.innerHTML).toContain("Hello <em");
    expect(target.innerHTML).toContain('class="highlight"');
    expect(target.innerHTML).toContain("hidden");
    expect(target.innerHTML).not.toContain("disabled");
    expect(target.innerHTML).toContain("Alice</em>!");
  });

  it("supports shorthand string mapping for interpolation tags", () => {
    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "welcome",
        params: { name: "Alice" },
        components: {
          strong: "strong",
        },
      },
    });

    expect(target.innerHTML).toContain("Hello <strong>Alice</strong>!");
  });

  it("renders mapped self-closing tags", () => {
    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "linebreak",
        components: {
          break: {
            tag: "br",
          },
        },
      },
    });

    expect(target.innerHTML).toContain("Top<br");
    expect(target.innerHTML).toContain("Bottom");
  });

  it("escapes plain HTML in string translations", () => {
    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "unsafe",
      },
    });

    expect(target.innerHTML).toContain("&lt;img");
    expect(target.innerHTML).not.toContain("<img src=");
  });

  it("forwards raw flag to translation call params", () => {
    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "welcome",
        raw: true,
        params: { name: "Alice" },
      },
    });

    expect(fake.tRaw).toHaveBeenLastCalledWith("welcome", expect.objectContaining({ raw: true }));
  });

  it("preserves reserved params keys when corresponding props are omitted", () => {
    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "reserved",
        params: {
          locale: "fr",
          ns: "admin",
          fallback: "Fallback Text",
          raw: true,
        },
      },
    });

    expect(fake.hasTranslation).toHaveBeenCalledWith("reserved", "fr", "admin", true);
    expect(fake.tRaw).toHaveBeenLastCalledWith(
      "reserved",
      expect.objectContaining({
        locale: "fr",
        ns: "admin",
        fallback: "Fallback Text",
        raw: true,
      }),
    );
    expect(target.textContent).toContain("locale=fr|ns=admin|fallback=Fallback Text|raw=true");
  });

  it("throws when i18n context is not provided", () => {
    expect(() => {
      mount(T, {
        target,
        props: { i18nKey: "welcome" as any },
      });
    }).toThrow("i18n context not found");
  });

  it("escapes special characters in attribute values to prevent XSS", () => {
    fake.tImplementation = (key, params): TranslationResult => {
      const link =
        typeof params?.link === "function"
          ? params.link({ children: "click", name: "link" })
          : "click";
      return ["Please ", link];
    };
    fake.addTranslations({ en: { attrtest: "x" } });

    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "attrtest",
        components: {
          link: {
            tag: "a",
            props: { href: '"><img src=x onerror=alert(1)>', title: "it's a <test>" },
          },
        },
      },
    });

    // XSS payload must not create an actual <img> element
    expect(target.querySelector("img")).toBeNull();
    // The <a> element must exist with the payload safely contained as attribute text
    const anchor = target.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute("href")).toBe('"><img src=x onerror=alert(1)>');
    expect(anchor!.getAttribute("title")).toBe("it's a <test>");
    expect(anchor!.textContent).toBe("click");
  });

  it("strips event handler attributes from component props", () => {
    fake.tImplementation = (key, params): TranslationResult => {
      const btn =
        typeof params?.btn === "function"
          ? params.btn({ children: "Click", name: "btn" })
          : "Click";
      return [btn];
    };
    fake.addTranslations({ en: { evttest: "x" } });

    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "evttest",
        components: {
          btn: {
            tag: "span",
            props: { onclick: "alert(1)", onmouseover: "alert(2)", class: "safe" },
          },
        },
      },
    });

    const html = target.innerHTML;
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onmouseover");
    expect(html).toContain('class="safe"');
  });

  it("renders non-whitelisted tags as <span>", () => {
    fake.tImplementation = (key, params): TranslationResult => {
      const tag =
        typeof params?.danger === "function"
          ? params.danger({ children: "content", name: "danger" })
          : "content";
      return [tag];
    };
    fake.addTranslations({ en: { tagtest: "x" } });

    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "tagtest",
        components: {
          danger: "script",
        },
      },
    });

    const html = target.innerHTML;
    expect(html).not.toContain("<script");
    expect(html).toContain("<span>content</span>");
  });

  it("strips srcdoc and formaction attributes", () => {
    fake.tImplementation = (key, params): TranslationResult => {
      const frame =
        typeof params?.frame === "function"
          ? params.frame({ children: "text", name: "frame" })
          : "text";
      return [frame];
    };
    fake.addTranslations({ en: { srcdoctest: "x" } });

    component = mount(TInterpolationWrapper, {
      target,
      props: {
        i18n: fake.asI18n(),
        i18nKey: "srcdoctest",
        components: {
          frame: {
            tag: "span",
            props: {
              srcdoc: "<script>alert(1)</script>",
              formaction: "https://evil.com",
              id: "ok",
            },
          },
        },
      },
    });

    const html = target.innerHTML;
    expect(html).not.toContain("srcdoc");
    expect(html).not.toContain("formaction");
    expect(html).toContain('id="ok"');
  });
});
