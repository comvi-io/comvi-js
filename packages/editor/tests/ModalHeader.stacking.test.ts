import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import ModalHeader from "../src/components/editModal/ModalHeader.vue";
import { HighlightedTextarea } from "../src/components/ui/highlighted-textarea";

const zIndexOf = (classes: string[]): number => {
  const z = classes.find((c) => /^z-\d+$/.test(c));
  return z ? Number(z.slice(2)) : 0;
};

describe("ModalHeader stacking", () => {
  // The sticky header is its own stacking context, so the language picker rendered inside it
  // paints at the header's level. Without a z-index above the textareas' `z-10`, the first
  // section's textarea draws over the open picker. happy-dom has no layout, so this pins the
  // classes, not the painting.
  it("sits above the translation textareas", () => {
    const header = mount(ModalHeader, {
      props: { translationKey: ref("key"), languages: [], selectedLanguageCodes: [] },
      global: { stubs: { DialogTitle: true, DialogDescription: true } },
    });
    const field = mount(HighlightedTextarea);

    const textarea = field.find("textarea");
    expect(zIndexOf(textarea.classes())).toBeGreaterThan(0);
    expect(zIndexOf(header.classes())).toBeGreaterThan(zIndexOf(textarea.classes()));
  });
});
