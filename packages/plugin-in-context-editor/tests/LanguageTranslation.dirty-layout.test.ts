import { describe, expect, it } from "vitest";
import { computed } from "vue";
import { mount } from "@vue/test-utils";
import LanguageTranslation from "../src/components/editModal/LanguageTranslation.vue";
import type { Language } from "../src/types";

const GERMAN: Language = {
  id: 2,
  code: "de",
  name: "German",
  nativeName: "Deutsch",
  pluralForms: ["one", "other"],
  isSource: false,
};

const COLOUR_CLASSES = ["border-l-warn", "border-l-transparent"];

type Mode = { plural: boolean; select: boolean; raw: boolean };

const MODES: Record<string, Mode> = {
  singular: { plural: false, select: false, raw: false },
  plural: { plural: true, select: false, raw: false },
  select: { plural: false, select: true, raw: false },
  "select x plural": { plural: true, select: true, raw: false },
  raw: { plural: true, select: false, raw: true },
};

function mountMode(mode: Mode, dirty: boolean) {
  return mount(LanguageTranslation, {
    props: { lang: GERMAN, translations: {} },
    global: {
      provide: {
        translationManager: {
          isPlural: computed(() => mode.plural),
          getSelectConfig: () =>
            mode.select
              ? { enabled: true, variable: "formality", options: ["formal", "informal"] }
              : undefined,
          isFieldDirty: () => dirty,
          isRawLanguage: () => mode.raw,
        },
      },
      stubs: { Tooltip: true, TooltipTrigger: true, TooltipContent: true },
    },
  });
}

/** Class tokens of the marker wrapper around each textarea, in document order. */
function wrapperClasses(mode: Mode, dirty: boolean): string[][] {
  const wrapper = mountMode(mode, dirty);
  return wrapper.findAll("textarea").map((field) => {
    let el: HTMLElement | null = field.element.parentElement;
    while (el && !el.classList.contains("transition-colors")) el = el.parentElement;
    expect(el, "marker wrapper around the textarea").not.toBeNull();
    return [...el!.classList];
  });
}

describe("LanguageTranslation dirty marker does not shift the field", () => {
  for (const [name, mode] of Object.entries(MODES)) {
    it(`${name}: only the border colour differs between clean and dirty`, () => {
      const clean = wrapperClasses(mode, false);
      const dirty = wrapperClasses(mode, true);

      expect(clean.length).toBeGreaterThan(0);
      expect(dirty).toHaveLength(clean.length);
      clean.forEach((cleanClasses, i) => {
        const dirtyClasses = dirty[i]!;
        expect(cleanClasses).toContain("border-l-2");
        expect(cleanClasses).toContain("border-l-transparent");
        expect(dirtyClasses).toContain("border-l-warn");

        const layout = (classes: string[]) => classes.filter((c) => !COLOUR_CLASSES.includes(c));
        expect(layout(dirtyClasses)).toEqual(layout(cleanClasses));
      });
    });
  }
});

describe("LanguageTranslation source section", () => {
  const mountLang = (isSource: boolean) =>
    mount(LanguageTranslation, {
      props: { lang: { ...GERMAN, isSource }, translations: {} },
      global: {
        provide: {
          translationManager: {
            isPlural: computed(() => false),
            getSelectConfig: () => undefined,
            isFieldDirty: () => false,
            isRawLanguage: () => false,
          },
        },
        stubs: { Tooltip: true, TooltipTrigger: true, TooltipContent: true },
      },
    });

  it("has no background tint and shows a neutral Source badge", () => {
    const wrapper = mountLang(true);

    expect(wrapper.element.className).not.toMatch(/\bbg-/);
    const badge = wrapper.findAll("div").find((el) => el.text() === "Source");
    expect(badge, "Source badge").toBeDefined();
    expect(badge!.classes()).toContain("bg-surface-2");
    expect(badge!.classes()).not.toContain("bg-accent-soft");
    expect(badge!.classes()).not.toContain("text-primary");
  });
});
