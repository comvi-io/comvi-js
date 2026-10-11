/**
 * F-18 on the server: `render()` from `svelte/server` paints the bound
 * formatters in the instance locale, with no subscriber machinery running.
 */
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ReactiveFormattersHarness from "../ReactiveFormattersHarness.test.svelte";
import { createI18n } from "../../src/index";

const eur = (locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(1234.5);

describe("svelte SSR — bound formatters", () => {
  it("formats in the instance locale", () => {
    const i18n = createI18n({ locale: "de", exposeGlobal: false, messages: { de: {} } });
    const { body } = render(ReactiveFormattersHarness, { props: { i18n } });
    expect(body).toContain(`<span data-testid="currency">${eur("de")}</span>`);
  });
});
