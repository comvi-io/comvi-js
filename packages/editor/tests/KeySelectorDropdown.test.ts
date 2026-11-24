import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import KeySelectorDropdown from "../src/components/KeySelectorDropdown.vue";

const getTranslationMock = vi.fn();

vi.mock("../src/services/translationService", () => ({
  getTranslation: (...args: unknown[]) => getTranslationMock(...args),
}));

function stored(value: string) {
  return { key: "k", isPlural: false, translations: { en: { other: value } } };
}

/** Every mounted selector, unmounted after each test: its Escape/outside-click listeners and arming timer go with it. */
const mounted: VueWrapper[] = [];

async function mountSelector(items: { key: string; textPreview?: string }[]) {
  const wrapper = mount(KeySelectorDropdown, {
    props: {
      keyData: items.map((item) => ({ ns: "default", ...item })),
      position: { top: 0, left: 0 },
      open: ref(true),
      defaultNs: "default",
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("KeySelectorDropdown entries", () => {
  beforeEach(() => {
    getTranslationMock.mockReset();
  });

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
  });

  it("shows a value once when the page text and the stored value match", async () => {
    getTranslationMock.mockResolvedValue(stored("Hello"));
    const wrapper = await mountSelector([{ key: "banner.hello", textPreview: "Hello" }]);

    const option = wrapper.find('[role="option"]');
    expect(option.text().match(/Hello/g)).toHaveLength(1);
  });

  it("shows the stored value beside the page text when they differ", async () => {
    getTranslationMock.mockResolvedValue(stored("{count, plural, one {# item} other {# items}}"));
    const wrapper = await mountSelector([{ key: "cart.items", textPreview: "3 items" }]);

    const text = wrapper.find('[role="option"]').text();
    expect(text).toContain('Text: "3 items"');
    expect(text).toContain("{count, plural, one {# item} other {# items}}");
  });

  it("shows the stored value when the element has no page text", async () => {
    getTranslationMock.mockResolvedValue(stored("Bye"));
    const wrapper = await mountSelector([{ key: "banner.bye" }]);

    expect(wrapper.find('[role="option"]').text()).toContain("Bye");
  });

  it("separates the panel from the page like the modal: border and large shadow", async () => {
    getTranslationMock.mockResolvedValue(stored("Hello"));
    const wrapper = await mountSelector([{ key: "banner.hello", textPreview: "Hello" }]);

    const classes = wrapper.find('[role="listbox"]').classes();
    expect(classes).toEqual(expect.arrayContaining(["border", "border-border", "shadow-lg"]));
  });
});
