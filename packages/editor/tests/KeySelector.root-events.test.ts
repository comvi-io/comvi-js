/**
 * The selector's contract with its root component: `update:open` is the only
 * way the root can ask to stay open or close. The shipped dropdown only ever
 * reports `false`, so a stub root (real `createApp`, real shadow root) is how
 * the `true` half of the contract is reached.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

vi.mock("../src/KeySelectorApp.vue", () => ({
  default: defineComponent({
    emits: ["update:open"],
    setup(_props, { emit }) {
      return () =>
        h("button", { id: "report-open", onClick: () => emit("update:open", true) }, "open");
    },
  }),
}));

import { closeKeySelector, showKeySelector } from "../src/KeySelector";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";

function selectorHosts(): Element[] {
  return Array.from(document.querySelectorAll(`[${EDITOR_UI_SHADOW_HOST_ATTRIBUTE}]`));
}

afterEach(() => {
  closeKeySelector();
});

describe("key selector root events", () => {
  it("root reports update:open(true) → the selector stays on the page", () => {
    showKeySelector(
      [{ key: "home.title", ns: "default" }],
      document.createElement("button"),
      vi.fn(),
    );

    selectorHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>("#report-open")!.click();

    expect(selectorHosts()).toHaveLength(1);
  });
});
