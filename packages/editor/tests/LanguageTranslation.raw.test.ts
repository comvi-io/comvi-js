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

const EXACT = "{count, plural, =0 {Keine} one {Eine} other {# Dateien}}";

function mountLanguage(raw: boolean) {
  return mount(LanguageTranslation, {
    props: { lang: GERMAN, translations: raw ? { other: EXACT } : { one: "Eine", other: "#" } },
    global: {
      provide: {
        translationManager: {
          isPlural: computed(() => true),
          getSelectConfig: () => undefined,
          isFieldDirty: () => false,
          isRawLanguage: (code: string) => raw && code === "de",
        },
      },
      stubs: { Tooltip: true, TooltipTrigger: true, TooltipContent: true },
    },
  });
}

describe("LanguageTranslation for ICU the form fields cannot rebuild", () => {
  it("shows the stored message in one field and keeps variants off", () => {
    const wrapper = mountLanguage(true);

    const fields = wrapper.findAll("textarea");
    expect(fields).toHaveLength(1);
    expect((fields[0]!.element as HTMLTextAreaElement).value).toBe(EXACT);
    expect(wrapper.text()).toContain("edited as written");
    expect(wrapper.find('[role="checkbox"]').attributes("disabled")).toBeDefined();
  });

  it("shows one field per plural form for a message it can rebuild", () => {
    const wrapper = mountLanguage(false);

    expect(wrapper.findAll("textarea")).toHaveLength(2);
    expect(wrapper.find('[role="checkbox"]').attributes("disabled")).toBeUndefined();
  });
});
