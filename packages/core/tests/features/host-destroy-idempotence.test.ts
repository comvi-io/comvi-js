import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";

describe("destroy()", () => {
  it("ignores a second call, so a listener added afterwards never fires", async () => {
    const i18n = createI18n({ locale: "en" });
    await i18n.destroy();
    const afterDestroy = vi.fn();
    i18n.on("destroyed", afterDestroy);

    await i18n.destroy();

    expect(afterDestroy).not.toHaveBeenCalled();
  });

  it("emits no loading-state change when the host was idle", async () => {
    const i18n = createI18n({ locale: "en" });
    const loadingStateChanged = vi.fn();
    i18n.on("loadingStateChanged", loadingStateChanged);

    await i18n.destroy();

    expect(loadingStateChanged).not.toHaveBeenCalled();
  });

  it("drops the post-processors, so a later t() returns the key and reports nothing", async () => {
    const onError = vi.fn();
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" } },
      postProcess: (result) => `${result}!`,
      onError,
    });

    await i18n.destroy();

    expect(i18n.t("greeting")).toBe("greeting");
    expect(onError).not.toHaveBeenCalled();
  });
});
