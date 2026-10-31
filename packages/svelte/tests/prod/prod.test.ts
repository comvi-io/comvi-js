/** Production (`esm-env` DEV false): no development diagnostics. */
import { describe, expect, it } from "vitest";
import { make, mountWith, warnings } from "../helpers";
import Rich from "../fixtures/Rich.svelte";

describe("production", () => {
  it("a snippet's tag with markup warns about nothing", async () => {
    const logged = await warnings(() => {
      const { i18n } = make({ locale: "en", messages: { en: { m: "<b>a <i>c</i></b>" } } });
      expect(mountWith(i18n, Rich, { i18nKey: "m", components: { i: "em" } }).html()).toBe(
        "<mark>a c</mark>",
      );
    });
    expect(logged).toEqual([]);
  });
});
