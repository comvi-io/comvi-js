import { afterEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import { createI18n } from "../src/index";
import ReactiveFormattersHarness from "./ReactiveFormattersHarness.test.svelte";

let component: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  document.body.innerHTML = "";
});

const text = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent;

// `zz` is a well-formed tag no runtime ships data for, so it formats in its fallback.
describe("@comvi/svelte — formatters follow the fallback-locale chain", () => {
  it("formats in the fallback, and markup follows setFallbackLocale", async () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: "de", exposeGlobal: false });
    component = mount(ReactiveFormattersHarness, { target: document.body, props: { i18n } });
    await tick();

    expect(text("currency")).toBe("1.234,50 €");
    expect(text("pinned-number")).toBe("1,234.5");

    i18n.setFallbackLocale("fr");
    await tick();

    expect(text("currency")).toBe(
      new Intl.NumberFormat("fr", { style: "currency", currency: "EUR" }).format(1234.5),
    );
  });
});
