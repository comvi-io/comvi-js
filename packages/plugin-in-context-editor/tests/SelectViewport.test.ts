/**
 * The select dropdown must not render reka-ui's inline `<style>`: under a
 * strict `style-src` every open of the dropdown would be a CSP violation. The
 * editor's `SelectContent` therefore renders its own `SelectViewport`, which
 * is reka's with that one element removed.
 */

import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { SelectContent as RekaSelectContent, SelectViewport as RekaSelectViewport } from "reka-ui";
import { h, nextTick, type Component } from "vue";
import { Select, SelectContent, SelectItem } from "../src/components/ui/select";

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

async function mountOpenSelect(content: () => ReturnType<typeof h>): Promise<HTMLElement> {
  wrapper = mount(
    { render: () => h(Select as Component, { open: true, modelValue: "a" }, { default: content }) },
    { attachTo: document.body },
  );
  await nextTick();
  await nextTick();
  return document.body;
}

const items = () => [
  h(SelectItem as Component, { value: "a" }, { default: () => "Alpha" }),
  h(SelectItem as Component, { value: "b" }, { default: () => "Beta" }),
];

describe("ui/select SelectContent", () => {
  it("open dropdown → renders the viewport with its items and no <style> element", async () => {
    const body = await mountOpenSelect(() =>
      h(SelectContent as Component, null, { default: items }),
    );

    const viewport = body.querySelector("[data-reka-select-viewport]");
    expect(viewport?.getAttribute("role")).toBe("presentation");
    expect(viewport?.textContent).toContain("Beta");
    expect(body.querySelectorAll("style")).toHaveLength(0);
  });

  it("open dropdown → the viewport keeps reka's scroll container styles and takes the class once", async () => {
    const body = await mountOpenSelect(() =>
      h(SelectContent as Component, null, { default: items }),
    );

    const viewport = body.querySelector<HTMLElement>("[data-reka-select-viewport]");
    expect(viewport?.style.position).toBe("relative");
    expect(viewport?.style.overflow).toBe("hidden auto");
    expect(viewport?.className.split(/\s+/).filter((name) => name === "p-1")).toHaveLength(1);
  });

  it("reka-ui's own SelectViewport in the same dropdown → does render a <style> (what the editor's viewport removes)", async () => {
    const body = await mountOpenSelect(() =>
      h(
        RekaSelectContent,
        { position: "popper" },
        { default: () => h(RekaSelectViewport, null, { default: items }) },
      ),
    );

    expect(body.querySelector("[data-reka-select-viewport]")).not.toBeNull();
    expect(body.querySelectorAll("style")).toHaveLength(1);
  });
});
